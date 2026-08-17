import type { MarketEvent } from '../../../contracts/realtime/marketEvent';
import { buildEdgeEvidence, clamp01, type LiquidityHunterEdgeContext } from '../edgeRuntime';

interface GammaPoint {
  event: MarketEvent;
  strike: number;
  spot: number;
  exposure: number;
  estimated: boolean;
  methodology: string | null;
  gammaMethodology: string | null;
}

function parse(event: MarketEvent): GammaPoint | null {
  if (!event.payload || typeof event.payload !== 'object') return null;
  const row = event.payload as Record<string, unknown>;
  const strike = Number(row.strike);
  const spot = Number(row.spot);
  const gamma = Number(row.gamma);
  const contracts = Number(row.contracts ?? 1);
  const dealerGammaExposure = Number(row.dealerGammaExposure);
  const takerSide = String(row.takerSide || '').toUpperCase();
  if (!Number.isFinite(strike) || strike <= 0 || !Number.isFinite(spot) || spot <= 0) return null;
  const methodology = typeof row.methodology === 'string' ? row.methodology : null;
  const gammaMethodology = typeof row.gammaMethodology === 'string' ? row.gammaMethodology : null;
  if (Number.isFinite(dealerGammaExposure)) {
    return { event, strike, spot, exposure: dealerGammaExposure, estimated: false, methodology, gammaMethodology };
  }
  if (!Number.isFinite(gamma) || gamma < 0 || !Number.isFinite(contracts) || contracts <= 0 || (takerSide !== 'BUY' && takerSide !== 'SELL')) return null;
  // Taker BUY implies the liquidity-providing dealer is short gamma; taker SELL
  // implies the dealer is long gamma. This is a flow estimate, not an OI
  // heuristic, and remains shadow-only until provider inventory reconstruction
  // is validated.
  const dealerSign = takerSide === 'BUY' ? -1 : 1;
  return { event, strike, spot, exposure: gamma * contracts * spot * dealerSign, estimated: true, methodology, gammaMethodology };
}

export function evaluateOptionsGammaEdge(context: LiquidityHunterEdgeContext) {
  const events = context.seriesStore.query({ symbol: context.symbol, type: 'OPTION_TRADE', since: context.now - 60 * 60_000, limit: 20_000 });
  const points = events.map(parse).filter((row): row is GammaPoint => Boolean(row));
  if (points.length < 12) {
    return buildEdgeEvidence({
      edgeId: 'OPTIONS_GAMMA',
      status: events.length ? 'UNKNOWN' : 'NOT_CONFIGURED',
      dataQuality: clamp01(points.length / 12 * 0.7),
      observedAt: points.at(-1)?.event.exchangeTimestamp ?? context.now,
      expiresAt: context.now,
      conflictingReasons: [events.length ? 'insufficient_valid_taker_flow_gamma_sample' : 'options_taker_flow_provider_not_configured'],
      rawEventIds: points.map((row) => row.event.eventId),
    }, context.now);
  }

  const byStrike = new Map<number, number>();
  let estimatedCount = 0;
  for (const point of points) {
    byStrike.set(point.strike, (byStrike.get(point.strike) ?? 0) + point.exposure);
    if (point.estimated) estimatedCount += 1;
  }
  const spot = points.at(-1)!.spot;
  const strikes = [...byStrike.entries()].sort((a, b) => a[0] - b[0]);
  let gammaFlip: number | null = null;
  for (let index = 1; index < strikes.length; index += 1) {
    const previous = strikes[index - 1];
    const current = strikes[index];
    if ((previous[1] <= 0 && current[1] > 0) || (previous[1] >= 0 && current[1] < 0)) {
      const candidate = (previous[0] + current[0]) / 2;
      if (gammaFlip === null || Math.abs(candidate - spot) < Math.abs(gammaFlip - spot)) gammaFlip = candidate;
    }
  }
  const netExposure = strikes.reduce((sum, [, exposure]) => sum + exposure, 0);
  const regime = netExposure < 0 ? 'NEGATIVE_GAMMA' : netExposure > 0 ? 'POSITIVE_GAMMA' : 'NEUTRAL_GAMMA';
  const direction = regime === 'NEGATIVE_GAMMA' ? 'NEUTRAL' : 'NEUTRAL';
  const absolute = strikes.reduce((sum, [, exposure]) => sum + Math.abs(exposure), 0);
  const concentration = absolute > 0 ? Math.abs(netExposure) / absolute : 0;
  const score = clamp01(concentration * 0.7 + (gammaFlip !== null ? 0.3 : 0));
  const observedAt = points.at(-1)!.event.exchangeTimestamp;
  const directShare = 1 - estimatedCount / points.length;
  const sourceSet = new Set(points.map((point) => point.event.source));
  const methodologySet = new Set(points.map((point) => point.methodology).filter((value): value is string => Boolean(value)));
  const gammaMethodologySet = new Set(points.map((point) => point.gammaMethodology).filter((value): value is string => Boolean(value)));
  const publicDeribitProxy = sourceSet.size > 0 && [...sourceSet].every((source) => source === 'deribit-options-public');
  const historicalDeribitProxy = sourceSet.size > 0 && [...sourceSet].every((source) => source === 'deribit-options-historical-import');
  const usesCurrentTickerFallback = gammaMethodologySet.has('CURRENT_TICKER_GAMMA_FALLBACK');
  const usesEventTimeIvGamma = gammaMethodologySet.has('BLACK_SCHOLES_FROM_DERIBIT_TRADE_IV_ZERO_RATE');
  const baseQuality = clamp01(0.65 + Math.min(points.length / 100, 1) * 0.15 + directShare * 0.20);
  let dataQuality = baseQuality;
  if (publicDeribitProxy || historicalDeribitProxy) {
    // Event-time IV reconstruction removes the temporal mismatch caused by
    // applying a later ticker gamma to an older trade. It still estimates
    // incremental taker-flow exposure rather than complete dealer inventory.
    dataQuality = Math.min(baseQuality, usesCurrentTickerFallback ? 0.78 : usesEventTimeIvGamma ? 0.88 : 0.82);
  }

  return buildEdgeEvidence({
    edgeId: 'OPTIONS_GAMMA',
    status: regime === 'NEUTRAL_GAMMA' ? 'FAIL' : 'PASS',
    direction,
    score,
    dataQuality,
    observedAt,
    expiresAt: observedAt + 60_000,
    supportingReasons: [
      `gamma_regime:${regime}`,
      `net_flow_gamma_exposure:${netExposure.toFixed(4)}`,
      `gamma_flip:${gammaFlip === null ? 'unresolved' : gammaFlip.toFixed(2)}`,
    ],
    conflictingReasons: [
      ...(estimatedCount > 0 ? ['gamma_exposure_partially_estimated_from_taker_flow'] : []),
      ...((publicDeribitProxy || historicalDeribitProxy) ? ['deribit_taker_flow_gamma_proxy_not_complete_dealer_inventory'] : []),
      ...(usesCurrentTickerFallback ? ['some_gamma_points_use_collection_time_ticker_fallback'] : []),
    ],
    rawEventIds: points.map((point) => point.event.eventId),
    metadata: {
      regime,
      gammaFlip,
      spot,
      netExposure,
      strikeCount: strikes.length,
      directExposureShare: directShare,
      providerMode: publicDeribitProxy ? 'PUBLIC_TAKER_FLOW_PROXY' : historicalDeribitProxy ? 'HISTORICAL_TAKER_FLOW_PROXY' : 'EXTERNAL_OR_REPLAY',
      sources: [...sourceSet],
      methodologies: [...methodologySet],
      gammaMethodologies: [...gammaMethodologySet],
      amplificationExpected: regime === 'NEGATIVE_GAMMA',
    },
  }, context.now);
}
