import type { MarketEvent } from '../../../contracts/realtime/marketEvent';
import { buildEdgeEvidence, clamp01, mean, pickNumber, stdDev, type LiquidityHunterEdgeContext } from '../edgeRuntime';

const FUNDING_LOOKBACK_PER_SOURCE = 48;
const MIN_FUNDING_SAMPLES = 12;
const OI_LOOKBACK_PER_SOURCE = 8;
const FUNDING_Z_THRESHOLD = 2;
const MIN_OI_VELOCITY_PCT = 0.10;
const BINANCE_SOURCE = 'binance-usdm-rest-context';
const KUCOIN_SOURCE = 'kucoin-futures-rest-context';
const PRIMARY_SOURCES = [BINANCE_SOURCE, KUCOIN_SOURCE] as const;

interface VenueMetric {
  source: string;
  fundingRows: Array<{ event: MarketEvent; value: number }>;
  oiRows: Array<{ event: MarketEvent; value: number }>;
  fundingRate: number;
  fundingMean: number;
  fundingStdDev: number;
  fundingZScore: number;
  openInterest: number;
  oiVelocityPct: number;
  phase: string;
  expectedDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  expectedSweepDirection: 'UP' | 'DOWN' | 'NONE';
  score: number;
  pass: boolean;
  observedAt: number;
  freshness: number;
  dataQuality: number;
}

function groupBySource(events: MarketEvent[]): Map<string, MarketEvent[]> {
  const grouped = new Map<string, MarketEvent[]>();
  for (const event of events) {
    const rows = grouped.get(event.source) ?? [];
    rows.push(event);
    grouped.set(event.source, rows);
  }
  return grouped;
}

function computeVenueMetric(source: string, fundingEvents: MarketEvent[], oiEvents: MarketEvent[], now: number): VenueMetric | null {
  const fundingRows = fundingEvents
    .slice(-FUNDING_LOOKBACK_PER_SOURCE)
    .map((event) => ({ event, value: pickNumber(event.payload, ['rate', 'fundingRate', 'funding']) }))
    .filter((row): row is { event: MarketEvent; value: number } => row.value !== null);
  const oiRows = oiEvents
    .slice(-OI_LOOKBACK_PER_SOURCE)
    .map((event) => ({ event, value: pickNumber(event.payload, ['openInterest', 'oi', 'value']) }))
    .filter((row): row is { event: MarketEvent; value: number } => row.value !== null && row.value > 0);

  if (fundingRows.length < MIN_FUNDING_SAMPLES || oiRows.length < 2) return null;

  const latestFunding = fundingRows.at(-1)!;
  const history = fundingRows.slice(0, -1).map((row) => row.value);
  const average = mean(history);
  const sigma = stdDev(history, average);
  const zScore = sigma > 1e-12 ? (latestFunding.value - average) / sigma : 0;
  const previousOi = oiRows.at(-2)!;
  const latestOi = oiRows.at(-1)!;
  const oiVelocityPct = previousOi.value > 0 ? ((latestOi.value - previousOi.value) / previousOi.value) * 100 : 0;
  const extreme = Math.abs(zScore) >= FUNDING_Z_THRESHOLD;
  const meaningfulOiMove = Math.abs(oiVelocityPct) >= MIN_OI_VELOCITY_PCT;
  const expectedDirection = zScore > 0 ? 'SHORT' : zScore < 0 ? 'LONG' : 'NEUTRAL';
  const phase = oiVelocityPct > MIN_OI_VELOCITY_PCT ? 'CROWDING_BUILDING'
    : oiVelocityPct < -MIN_OI_VELOCITY_PCT ? 'DELEVERAGING_FRACTURE'
      : 'OI_FLAT';
  const score = clamp01((Math.abs(zScore) / 3) * 0.68 + (Math.min(Math.abs(oiVelocityPct), 2) / 2) * 0.32);
  const observedAt = Math.max(latestFunding.event.exchangeTimestamp, latestOi.event.exchangeTimestamp);
  const ageMs = Math.max(0, now - observedAt);
  const freshness = clamp01(1 - ageMs / 60_000);
  const dataQuality = clamp01(0.75 + Math.min(fundingRows.length / FUNDING_LOOKBACK_PER_SOURCE, 1) * 0.15 + freshness * 0.10);

  return {
    source,
    fundingRows,
    oiRows,
    fundingRate: latestFunding.value,
    fundingMean: average,
    fundingStdDev: sigma,
    fundingZScore: zScore,
    openInterest: latestOi.value,
    oiVelocityPct,
    phase,
    expectedDirection,
    expectedSweepDirection: zScore > 0 ? 'DOWN' : zScore < 0 ? 'UP' : 'NONE',
    score,
    pass: extreme && meaningfulOiMove,
    observedAt,
    freshness,
    dataQuality,
  };
}

export function evaluateFundingOiEdge(context: LiquidityHunterEdgeContext) {
  const fundingEvents = context.seriesStore.query({ symbol: context.symbol, type: 'FUNDING', limit: 256 });
  const oiEvents = context.seriesStore.query({ symbol: context.symbol, type: 'OPEN_INTEREST', limit: 64 });
  const fundingBySource = groupBySource(fundingEvents);
  const oiBySource = groupBySource(oiEvents);
  const sourceIds = new Set([...fundingBySource.keys(), ...oiBySource.keys()]);
  const metrics = [...sourceIds]
    .map((source) => computeVenueMetric(source, fundingBySource.get(source) ?? [], oiBySource.get(source) ?? [], context.now))
    .filter((row): row is VenueMetric => Boolean(row));

  if (metrics.length === 0) {
    const fundingSamples = [...fundingBySource.values()].reduce((sum, rows) => sum + rows.length, 0);
    const oiSamples = [...oiBySource.values()].reduce((sum, rows) => sum + rows.length, 0);
    return buildEdgeEvidence({
      edgeId: 'FUNDING_OI',
      status: 'UNKNOWN',
      dataQuality: clamp01(Math.min(fundingSamples / MIN_FUNDING_SAMPLES, oiSamples / 2)),
      observedAt: Math.max(fundingEvents.at(-1)?.exchangeTimestamp ?? 0, oiEvents.at(-1)?.exchangeTimestamp ?? 0, context.now),
      expiresAt: context.now,
      conflictingReasons: ['insufficient_funding_or_open_interest_history'],
      rawEventIds: [...fundingEvents, ...oiEvents].map((event) => event.eventId),
      metadata: { sourceCount: 0, primaryPairActive: false },
    }, context.now);
  }

  const byId = new Map(metrics.map((metric) => [metric.source, metric]));
  const binance = byId.get(BINANCE_SOURCE);
  const kucoin = byId.get(KUCOIN_SOURCE);
  const primaryPairActive = Boolean(binance && kucoin);

  if (primaryPairActive && binance && kucoin) {
    const pair = [binance, kucoin];
    const directionalAgreement = binance.expectedDirection !== 'NEUTRAL'
      && binance.expectedDirection === kucoin.expectedDirection;
    const passCount = pair.filter((metric) => metric.pass).length;
    const score = clamp01(mean(pair.map((metric) => metric.score)));
    const observedAt = Math.max(...pair.map((metric) => metric.observedAt));
    const dataQuality = clamp01(mean(pair.map((metric) => metric.dataQuality)) * (directionalAgreement ? 1 : 0.82));
    const status = directionalAgreement && passCount >= 1 && score >= 0.45 ? 'PASS' : 'FAIL';
    const direction = directionalAgreement ? binance.expectedDirection : 'NEUTRAL';
    const oiVelocityPct = mean(pair.map((metric) => metric.oiVelocityPct));
    const fundingZScore = mean(pair.map((metric) => metric.fundingZScore));

    return buildEdgeEvidence({
      edgeId: 'FUNDING_OI',
      status,
      direction,
      score,
      dataQuality,
      observedAt,
      expiresAt: observedAt + 60_000,
      supportingReasons: [
        `primary_pair:binance+kucoin`,
        `pair_directional_agreement:${directionalAgreement}`,
        `pair_pass_count:${passCount}`,
        `mean_funding_z_score:${fundingZScore.toFixed(3)}`,
        `mean_oi_velocity_pct:${oiVelocityPct.toFixed(3)}`,
      ],
      conflictingReasons: [
        ...(!directionalAgreement ? ['primary_futures_funding_direction_conflict'] : []),
        ...(passCount === 0 ? ['no_primary_source_meets_extreme_plus_oi_gate'] : []),
      ],
      rawEventIds: pair.flatMap((metric) => [...metric.fundingRows, ...metric.oiRows].map((row) => row.event.eventId)),
      metadata: {
        sourceCount: pair.length,
        primaryPairActive: true,
        directionalAgreement,
        passCount,
        fundingZScore,
        oiVelocityPct,
        expectedSweepDirection: direction === 'SHORT' ? 'DOWN' : direction === 'LONG' ? 'UP' : 'NONE',
        bySource: Object.fromEntries(pair.map((metric) => [metric.source, {
          fundingRate: metric.fundingRate,
          fundingZScore: metric.fundingZScore,
          openInterest: metric.openInterest,
          oiVelocityPct: metric.oiVelocityPct,
          phase: metric.phase,
          direction: metric.expectedDirection,
          score: metric.score,
          pass: metric.pass,
        }])),
      },
    }, context.now);
  }

  // Fail gracefully when only one venue has enough public history. Preserve the
  // original single-source decision semantics but cap confidence until the
  // Binance + KuCoin primary pair is simultaneously available.
  const selected = binance ?? kucoin ?? metrics.sort((a, b) => b.dataQuality - a.dataQuality)[0];
  const dataQuality = Math.min(selected.dataQuality, 0.78);
  return buildEdgeEvidence({
    edgeId: 'FUNDING_OI',
    status: selected.pass ? 'PASS' : 'FAIL',
    direction: selected.expectedDirection,
    score: selected.score,
    dataQuality,
    observedAt: selected.observedAt,
    expiresAt: selected.observedAt + 60_000,
    supportingReasons: [
      `funding_z_score:${selected.fundingZScore.toFixed(3)}`,
      `oi_velocity_pct:${selected.oiVelocityPct.toFixed(3)}`,
      `phase:${selected.phase}`,
      `source:${selected.source}`,
    ],
    conflictingReasons: [
      ...(!selected.pass ? ['funding_or_open_interest_gate_not_met'] : []),
      'primary_futures_pair_not_fully_available',
    ],
    rawEventIds: [...selected.fundingRows, ...selected.oiRows].map((row) => row.event.eventId),
    metadata: {
      fundingRate: selected.fundingRate,
      fundingMean: selected.fundingMean,
      fundingStdDev: selected.fundingStdDev,
      fundingZScore: selected.fundingZScore,
      openInterest: selected.openInterest,
      oiVelocityPct: selected.oiVelocityPct,
      phase: selected.phase,
      expectedSweepDirection: selected.expectedSweepDirection,
      sourceCount: 1,
      primaryPairActive: false,
      selectedSource: selected.source,
      availableSources: metrics.map((metric) => metric.source),
    },
  }, context.now);
}
