import type { EdgeEvidence } from '../../contracts/realtime/edgeEvidence';
import type { LayerDecision, MacroRegimeDecision } from '../../contracts/realtime/liquidityHunterState';
import { clamp01 } from './edgeRuntime';

function edge(evidence: EdgeEvidence[], id: EdgeEvidence['edgeId']): EdgeEvidence | null {
  return evidence.find((row) => row.edgeId === id) ?? null;
}

function unavailable(row: EdgeEvidence | null): boolean {
  return !row || row.status === 'UNKNOWN' || row.status === 'STALE' || row.status === 'NOT_CONFIGURED';
}

export function evaluateLayer1Macro(evidence: EdgeEvidence[], now = Date.now()): { layer: LayerDecision; macro: MacroRegimeDecision } {
  const funding = edge(evidence, 'FUNDING_OI');
  const gamma = edge(evidence, 'OPTIONS_GAMMA');
  const sentiment = edge(evidence, 'SENTIMENT_VELOCITY');
  const missing = [funding, gamma, sentiment].filter((row): row is EdgeEvidence => Boolean(row && unavailable(row)));
  const supporting: EdgeEvidence[] = [];
  const conflicting: EdgeEvidence[] = [];

  if (funding?.status === 'PASS') supporting.push(funding);
  else if (funding && !unavailable(funding)) conflicting.push(funding);

  const fundingDirection = funding?.status === 'PASS' ? funding.direction : null;
  const expectedSweepDirection = fundingDirection === 'SHORT' ? 'DOWN' : fundingDirection === 'LONG' ? 'UP' : 'NONE';
  const postSweepTradeBias = expectedSweepDirection === 'DOWN' ? 'LONG' : expectedSweepDirection === 'UP' ? 'SHORT' : 'NO_TRADE';

  if (gamma?.status === 'PASS') supporting.push(gamma);
  else if (gamma && !unavailable(gamma)) conflicting.push(gamma);
  if (sentiment?.status === 'PASS') {
    const sentimentAligned = expectedSweepDirection === 'DOWN' ? sentiment.direction === 'SHORT' : expectedSweepDirection === 'UP' ? sentiment.direction === 'LONG' : false;
    (sentimentAligned ? supporting : conflicting).push(sentiment);
  } else if (sentiment && !unavailable(sentiment) && sentiment.status === 'FAIL') conflicting.push(sentiment);

  const gammaRegime = String(gamma?.metadata?.regime || 'UNKNOWN');
  const volatilityRegime = gammaRegime === 'NEGATIVE_GAMMA' ? 'AMPLIFYING'
    : gammaRegime === 'POSITIVE_GAMMA' ? 'DAMPENING'
      : gamma?.status === 'PASS' ? 'UNSTABLE'
        : 'UNKNOWN';
  const fundingScore = funding?.status === 'PASS' ? funding.score ?? 0 : 0;
  const gammaScore = gamma?.status === 'PASS' ? gamma.score ?? 0 : 0;
  const sentimentScore = sentiment?.status === 'PASS' ? Math.min(0.1, (sentiment.score ?? 0) * 0.1) : 0;
  const score = clamp01(fundingScore * 0.65 + gammaScore * 0.25 + sentimentScore);
  const passed = Boolean(funding && funding.status === 'PASS' && funding.dataQuality >= 0.75 && expectedSweepDirection !== 'NONE');
  const expiresAt = Math.min(...supporting.map((row) => row.expiresAt).filter((value) => value > now), now + 60_000);

  return {
    macro: { expectedSweepDirection, postSweepTradeBias, volatilityRegime, score },
    layer: {
      layer: 1,
      status: passed ? 'PASSED' : 'BLOCKED',
      supporting,
      conflicting,
      missing,
      decidedAt: now,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : now,
    },
  };
}
