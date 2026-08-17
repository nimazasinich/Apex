import type { Candlestick } from '../../../types';
import type { CommanderEvidenceFamily, CommanderEvidenceQuality, CommanderEvidenceV1 } from '../../../contracts/commander/commanderEvidence';

export interface CommanderEvidenceAdapterBaseInput {
  evidenceId: string;
  symbol: string;
  timeframe: string;
  observedAt: string;
  receivedAt: string;
  source: string;
  sourceVersion?: string;
  inputFingerprint: string;
  expiresAt?: string;
  asOfIndex?: number;
}

export interface ClosedCandleWindow {
  candles: Candlestick[];
  reason: string | null;
}

export function closedCandleWindow(input: Candlestick[] | undefined, asOfIndex: number | undefined, minimumLength: number): ClosedCandleWindow {
  if (!Array.isArray(input) || input.length === 0) return { candles: [], reason: 'candle_input_missing' };
  if (asOfIndex !== undefined && (!Number.isSafeInteger(asOfIndex) || asOfIndex < 0 || asOfIndex >= input.length)) {
    return { candles: [], reason: 'invalid_as_of_index' };
  }
  const candles = input.slice(0, (asOfIndex ?? input.length - 1) + 1);
  if (candles.length < minimumLength) return { candles: [], reason: `insufficient_closed_candles:${minimumLength}` };
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const timestamp = Date.parse(candle.time);
    const valid = Number.isFinite(timestamp)
      && [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)
      && candle.high >= candle.low
      && candle.open > 0
      && candle.close > 0
      && (index === 0 || timestamp > Date.parse(candles[index - 1].time));
    if (!valid) return { candles: [], reason: 'invalid_or_non_chronological_closed_candle' };
  }
  return { candles, reason: null };
}

export function makeCommanderEvidence(input: CommanderEvidenceAdapterBaseInput, family: CommanderEvidenceFamily, values: {
  expertId?: string;
  direction?: CommanderEvidenceV1['direction'];
  thesisTags?: string[];
  score: number;
  confidence: number;
  valueQuality: CommanderEvidenceQuality;
  supportingReasons?: string[];
  conflictingReasons?: string[];
  rawEvidenceIds?: string[];
}): CommanderEvidenceV1 {
  return {
    version: 'commander_evidence_v1',
    evidenceId: input.evidenceId,
    expertId: values.expertId ?? `apex.${family.toLowerCase()}`,
    expertVersion: input.sourceVersion ?? 'apex-native-commander-adapter-v1',
    family,
    symbol: input.symbol,
    timeframe: input.timeframe,
    direction: values.direction ?? null,
    thesisTags: [...(values.thesisTags ?? [])],
    score: Number.isFinite(values.score) ? Math.max(-1, Math.min(1, values.score)) : 0,
    confidence: Number.isFinite(values.confidence) ? Math.max(0, Math.min(1, values.confidence)) : 0,
    valueQuality: values.valueQuality,
    observedAt: input.observedAt,
    receivedAt: input.receivedAt,
    expiresAt: input.expiresAt,
    source: input.source,
    sourceVersion: input.sourceVersion,
    supportingReasons: [...(values.supportingReasons ?? [])],
    conflictingReasons: [...(values.conflictingReasons ?? [])],
    rawEvidenceIds: [...(values.rawEvidenceIds ?? [])],
    inputFingerprint: input.inputFingerprint,
  };
}

export function unavailableCommanderEvidence(input: CommanderEvidenceAdapterBaseInput, family: CommanderEvidenceFamily, reason: string, quality: CommanderEvidenceQuality = 'MISSING'): CommanderEvidenceV1 {
  return makeCommanderEvidence(input, family, {
    score: 0,
    confidence: 0,
    valueQuality: quality,
    conflictingReasons: [reason],
  });
}

export function directionFromSignedScore(score: number, threshold = 0.05): 'LONG' | 'SHORT' | null {
  if (score > threshold) return 'LONG';
  if (score < -threshold) return 'SHORT';
  return null;
}
