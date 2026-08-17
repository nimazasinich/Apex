import type { MarketEvent } from '../../../contracts/realtime/marketEvent';
import { buildEdgeEvidence, clamp01, type LiquidityHunterEdgeContext } from '../edgeRuntime';

interface SentimentRow {
  event: MarketEvent;
  score: number;
  credibility: number;
}

function parse(event: MarketEvent): SentimentRow | null {
  if (!event.payload || typeof event.payload !== 'object') return null;
  const row = event.payload as Record<string, unknown>;
  const score = Number(row.score);
  const credibility = Number(row.credibility);
  if (!Number.isFinite(score) || !Number.isFinite(credibility)) return null;
  if (score < -1 || score > 1 || credibility < 0 || credibility > 1) return null;
  return { event, score, credibility };
}

function weightedMean(rows: SentimentRow[]): number {
  const weight = rows.reduce((sum, row) => sum + row.credibility, 0);
  return weight > 0 ? rows.reduce((sum, row) => sum + row.score * row.credibility, 0) / weight : 0;
}

export function evaluateSentimentVelocityEdge(context: LiquidityHunterEdgeContext) {
  const events = context.seriesStore.query({ symbol: context.symbol, type: 'SENTIMENT_EVENT', since: context.now - 30_000, limit: 2_000 });
  const rows = events.map(parse).filter((row): row is SentimentRow => Boolean(row));
  if (rows.length < 9) {
    return buildEdgeEvidence({
      edgeId: 'SENTIMENT_VELOCITY',
      status: events.length ? 'UNKNOWN' : 'NOT_CONFIGURED',
      dataQuality: clamp01(rows.length / 9 * 0.6),
      observedAt: rows.at(-1)?.event.exchangeTimestamp ?? context.now,
      expiresAt: context.now,
      conflictingReasons: [events.length ? 'insufficient_credibility_weighted_sentiment_sample' : 'sentiment_stream_not_configured'],
      rawEventIds: rows.map((row) => row.event.eventId),
    }, context.now);
  }

  const third = Math.max(1, Math.floor(rows.length / 3));
  const a = rows.slice(0, third);
  const b = rows.slice(third, third * 2);
  const c = rows.slice(third * 2);
  const meanA = weightedMean(a);
  const meanB = weightedMean(b);
  const meanC = weightedMean(c);
  const velocity1 = meanB - meanA;
  const velocity2 = meanC - meanB;
  const acceleration = velocity2 - velocity1;
  const averageCredibility = rows.reduce((sum, row) => sum + row.credibility, 0) / rows.length;
  const direction = acceleration > 0.08 ? 'LONG' : acceleration < -0.08 ? 'SHORT' : 'NEUTRAL';
  const score = clamp01(Math.abs(acceleration) / 0.35 * 0.75 + averageCredibility * 0.25);
  const observedAt = rows.at(-1)!.event.exchangeTimestamp;

  return buildEdgeEvidence({
    edgeId: 'SENTIMENT_VELOCITY',
    status: direction === 'NEUTRAL' ? 'FAIL' : 'PASS',
    direction,
    score,
    dataQuality: clamp01(averageCredibility * 0.7 + Math.min(rows.length / 30, 1) * 0.3),
    observedAt,
    expiresAt: observedAt + 30_000,
    supportingReasons: [
      `sentiment_acceleration:${acceleration.toFixed(4)}`,
      `sentiment_velocity_latest:${velocity2.toFixed(4)}`,
      `average_credibility:${averageCredibility.toFixed(3)}`,
    ],
    conflictingReasons: direction === 'NEUTRAL' ? ['sentiment_acceleration_below_threshold'] : [],
    rawEventIds: rows.map((row) => row.event.eventId),
    metadata: { meanA, meanB, meanC, velocity1, velocity2, acceleration, averageCredibility },
  }, context.now);
}
