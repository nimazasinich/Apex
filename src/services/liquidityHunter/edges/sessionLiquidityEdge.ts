import { buildEdgeEvidence, clamp01, type LiquidityHunterEdgeContext } from '../edgeRuntime';

function utcMinuteOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function activeSession(timestamp: number): 'LONDON_OPEN' | 'NEW_YORK_OPEN' | 'OFF_SESSION' {
  const minute = utcMinuteOfDay(timestamp);
  if (minute >= 7 * 60 && minute < 10 * 60) return 'LONDON_OPEN';
  if (minute >= 12 * 60 && minute < 15 * 60) return 'NEW_YORK_OPEN';
  return 'OFF_SESSION';
}

export function evaluateSessionLiquidityEdge(context: LiquidityHunterEdgeContext) {
  const smc = context.smartMoneyContext;
  const session = activeSession(context.now);
  if (!smc) {
    return buildEdgeEvidence({
      edgeId: 'SESSION_LIQUIDITY',
      status: 'UNKNOWN',
      dataQuality: 0,
      conflictingReasons: ['smart_money_context_unavailable'],
      observedAt: context.now,
      expiresAt: context.now,
      metadata: { session },
    }, context.now);
  }

  const directionalMagnitude = Math.abs(smc.smcDirectionalScore);
  const contextStrength = Math.max(smc.smcContextScore, smc.smartMoneyBiasScore, smc.liquiditySweepScore);
  const score = clamp01(directionalMagnitude * 0.45 + contextStrength * 0.55);
  const direction = smc.smcDirectionalScore > 0.08 ? 'LONG' : smc.smcDirectionalScore < -0.08 ? 'SHORT' : 'NEUTRAL';
  const sessionActive = session !== 'OFF_SESSION';
  const contextValid = score >= 0.35 && direction !== 'NEUTRAL';
  const status = sessionActive && contextValid ? 'PASS' : 'FAIL';

  return buildEdgeEvidence({
    edgeId: 'SESSION_LIQUIDITY',
    status,
    direction,
    score,
    dataQuality: clamp01(0.72 + Math.min(0.28, smc.ifcQualityScore * 0.2 + smc.zoneFreshnessScore * 0.08)),
    observedAt: context.now,
    expiresAt: context.now + 60_000,
    supportingReasons: [
      `session:${session}`,
      `smc_setup:${smc.setupModel}`,
      `smc_directional_score:${smc.smcDirectionalScore.toFixed(3)}`,
      `liquidity_sweep_score:${smc.liquiditySweepScore.toFixed(3)}`,
    ],
    conflictingReasons: [
      ...(!sessionActive ? ['outside_configured_liquidity_session'] : []),
      ...(!contextValid ? ['smart_money_context_below_threshold'] : []),
    ],
    metadata: {
      session,
      setupModel: smc.setupModel,
      controlSide: smc.controlSide,
      liquiditySweepScore: smc.liquiditySweepScore,
      zoneFreshnessScore: smc.zoneFreshnessScore,
    },
  }, context.now);
}
