import type { LiquidationCluster } from '../../../contracts/realtime/marketPayloads';
import { buildEdgeEvidence, clamp01, pickNumber, type LiquidityHunterEdgeContext } from '../edgeRuntime';

const APPROVED_PREDICTIVE_METHODOLOGIES = new Set([
  'HYBLOCK_PREDICTIVE_LIQUIDATION_HEATMAP_V2',
  'VERIFIED_REPLAY_LIQUIDATION_TOPOLOGY_V1',
]);

function topologyMethodology(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = String((payload as Record<string, unknown>).methodology ?? '').trim();
  return value || null;
}

function isPredictiveTopology(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const row = payload as Record<string, unknown>;
  return row.predictive === true && APPROVED_PREDICTIVE_METHODOLOGIES.has(String(row.methodology ?? ''));
}

function parseClusters(payload: unknown): LiquidationCluster[] {
  if (!payload || typeof payload !== 'object') return [];
  const raw = (payload as Record<string, unknown>).clusters;
  if (!Array.isArray(raw)) return [];
  const clusters: LiquidationCluster[] = [];
  for (const value of raw) {
    if (!value || typeof value !== 'object') continue;
    const row = value as Record<string, unknown>;
    const side = String(row.side || '').toUpperCase();
    const lowerPrice = Number(row.lowerPrice);
    const upperPrice = Number(row.upperPrice);
    const notionalUsd = Number(row.notionalUsd);
    const confidence = Number(row.confidence);
    if ((side !== 'LONG' && side !== 'SHORT') || !Number.isFinite(lowerPrice) || !Number.isFinite(upperPrice) || lowerPrice <= 0 || upperPrice < lowerPrice) continue;
    clusters.push({
      id: typeof row.id === 'string' ? row.id : undefined,
      side,
      lowerPrice,
      upperPrice,
      notionalUsd: Number.isFinite(notionalUsd) && notionalUsd >= 0 ? notionalUsd : undefined,
      confidence: Number.isFinite(confidence) ? clamp01(confidence) : undefined,
    });
  }
  return clusters;
}

function inferPrice(context: LiquidityHunterEdgeContext): number | null {
  if (context.currentPrice && context.currentPrice > 0) return context.currentPrice;
  const trades = context.seriesStore.query({ symbol: context.symbol, type: 'TRADE', limit: 1 });
  const tradePrice = trades.length ? pickNumber(trades[0].payload, ['price']) : null;
  if (tradePrice && tradePrice > 0) return tradePrice;
  const quotes = context.seriesStore.query({ symbol: context.symbol, type: 'QUOTE', limit: 1 });
  if (!quotes.length || !quotes[0].payload || typeof quotes[0].payload !== 'object') return null;
  const row = quotes[0].payload as Record<string, unknown>;
  const bid = Number(row.bid);
  const ask = Number(row.ask);
  return Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask >= bid ? (bid + ask) / 2 : null;
}

export function evaluateLiquidationTopologyEdge(context: LiquidityHunterEdgeContext) {
  const events = context.seriesStore.query({ symbol: context.symbol, type: 'LIQUIDATION', limit: 20 });
  const topologyEvent = [...events].reverse().find((event) => parseClusters(event.payload).length > 0 && isPredictiveTopology(event.payload));
  if (!topologyEvent) {
    return buildEdgeEvidence({
      edgeId: 'LIQUIDATION_TOPOLOGY',
      status: events.length ? 'UNKNOWN' : 'NOT_CONFIGURED',
      dataQuality: 0,
      observedAt: events.at(-1)?.exchangeTimestamp ?? context.now,
      expiresAt: context.now,
      conflictingReasons: [events.length ? 'liquidation_events_present_but_no_approved_predictive_cluster_topology' : 'verified_liquidation_topology_provider_not_configured'],
      rawEventIds: events.map((event) => event.eventId),
    }, context.now);
  }

  const clusters = parseClusters(topologyEvent.payload);
  const price = inferPrice(context);
  if (!price || price <= 0) {
    return buildEdgeEvidence({
      edgeId: 'LIQUIDATION_TOPOLOGY',
      status: 'UNKNOWN',
      dataQuality: 0.4,
      observedAt: topologyEvent.exchangeTimestamp,
      expiresAt: topologyEvent.exchangeTimestamp + 30_000,
      conflictingReasons: ['current_price_unavailable_for_cluster_selection'],
      rawEventIds: [topologyEvent.eventId],
    }, context.now);
  }

  const eligible = clusters.map((cluster) => {
    const midpoint = (cluster.lowerPrice + cluster.upperPrice) / 2;
    const distancePct = Math.abs(midpoint - price) / price * 100;
    const directional = cluster.side === 'LONG' ? midpoint < price : midpoint > price;
    return { cluster, midpoint, distancePct, directional };
  }).filter((row) => row.directional && row.distancePct <= 8);

  if (!eligible.length) {
    return buildEdgeEvidence({
      edgeId: 'LIQUIDATION_TOPOLOGY',
      status: 'FAIL',
      direction: 'NEUTRAL',
      score: 0.1,
      dataQuality: 0.8,
      observedAt: topologyEvent.exchangeTimestamp,
      expiresAt: topologyEvent.exchangeTimestamp + 30_000,
      supportingReasons: [`cluster_count:${clusters.length}`],
      conflictingReasons: ['no_directionally_relevant_cluster_within_8pct'],
      rawEventIds: [topologyEvent.eventId],
      metadata: { currentPrice: price, clusterCount: clusters.length, methodology: topologyMethodology(topologyEvent.payload) },
    }, context.now);
  }

  eligible.sort((left, right) => {
    const leftStrength = (left.cluster.notionalUsd ?? 0) * (left.cluster.confidence ?? 0.7) / Math.max(left.distancePct, 0.05);
    const rightStrength = (right.cluster.notionalUsd ?? 0) * (right.cluster.confidence ?? 0.7) / Math.max(right.distancePct, 0.05);
    if (rightStrength !== leftStrength) return rightStrength - leftStrength;
    return left.distancePct - right.distancePct;
  });
  const best = eligible[0];
  const maxNotional = Math.max(...eligible.map((row) => row.cluster.notionalUsd ?? 0), 1);
  const notionalScore = (best.cluster.notionalUsd ?? 0) / maxNotional;
  const proximityScore = clamp01(1 - best.distancePct / 8);
  const confidence = best.cluster.confidence ?? 0.7;
  const score = clamp01(proximityScore * 0.45 + confidence * 0.35 + notionalScore * 0.20);
  const direction = best.cluster.side === 'LONG' ? 'SHORT' : 'LONG';

  return buildEdgeEvidence({
    edgeId: 'LIQUIDATION_TOPOLOGY',
    status: 'PASS',
    direction,
    score,
    dataQuality: clamp01(0.75 + confidence * 0.25),
    observedAt: topologyEvent.exchangeTimestamp,
    expiresAt: topologyEvent.exchangeTimestamp + 30_000,
    supportingReasons: [
      `target_cluster_side:${best.cluster.side}`,
      `target_distance_pct:${best.distancePct.toFixed(3)}`,
      `target_score:${score.toFixed(3)}`,
    ],
    rawEventIds: [topologyEvent.eventId],
    metadata: {
      currentPrice: price,
      target: {
        clusterId: best.cluster.id ?? null,
        side: best.cluster.side,
        lowerPrice: best.cluster.lowerPrice,
        upperPrice: best.cluster.upperPrice,
        midpoint: best.midpoint,
        notionalUsd: best.cluster.notionalUsd ?? null,
        confidence,
        distancePct: best.distancePct,
      },
      expectedSweepDirection: best.cluster.side === 'LONG' ? 'DOWN' : 'UP',
      methodology: topologyMethodology(topologyEvent.payload),
    },
  }, context.now);
}
