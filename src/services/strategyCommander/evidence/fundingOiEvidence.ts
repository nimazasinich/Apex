import type { CommanderEvidenceV1 } from '../../../contracts/commander/commanderEvidence';
import { MathEngine } from '../../mathEngine';
import { directionFromSignedScore, makeCommanderEvidence, type CommanderEvidenceAdapterBaseInput, unavailableCommanderEvidence } from './evidenceAdapterUtils';

export interface FundingOiEvidenceInput extends CommanderEvidenceAdapterBaseInput {
  fundingRate?: number;
  oiChangePercent?: number;
  fundingThreshold?: number;
  oiExpansionThresholdPct?: number;
}

export function buildFundingOiEvidence(input: FundingOiEvidenceInput): CommanderEvidenceV1 {
  const fundingAvailable = Number.isFinite(input.fundingRate);
  const oiAvailable = Number.isFinite(input.oiChangePercent);
  if (!fundingAvailable && !oiAvailable) return unavailableCommanderEvidence(input, 'FUNDING_OI', 'funding_and_open_interest_missing');
  const fundingScore = fundingAvailable ? MathEngine.fundingBiasScore(Number(input.fundingRate), input.fundingThreshold ?? 0.0001) : 0;
  const oiScore = oiAvailable ? MathEngine.oiExpansionScore(Number(input.oiChangePercent), input.oiExpansionThresholdPct ?? 0.30) : 0;
  const score = fundingAvailable && oiAvailable ? fundingScore * 0.7 + oiScore * 0.3 : fundingAvailable ? fundingScore : oiScore;
  const partial = !fundingAvailable || !oiAvailable;
  return makeCommanderEvidence(input, 'FUNDING_OI', {
    direction: directionFromSignedScore(score),
    score,
    confidence: partial ? 0.5 : Math.min(1, Math.abs(score) + 0.25),
    valueQuality: partial ? 'ESTIMATED' : 'VALID',
    supportingReasons: [
      fundingAvailable ? `funding_bias:${fundingScore.toFixed(3)}` : 'funding_missing',
      oiAvailable ? `oi_expansion:${oiScore.toFixed(3)}` : 'open_interest_missing',
    ],
    conflictingReasons: partial ? ['funding_or_open_interest_partial'] : [],
  });
}
