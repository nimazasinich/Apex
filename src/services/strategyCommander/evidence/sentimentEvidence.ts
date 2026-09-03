import type { CommanderEvidenceV1 } from '../../../contracts/commander/commanderEvidence';
import type { SupplementalBundle } from '../../providers/supplementalTypes';
import { directionFromSignedScore, makeCommanderEvidence, type CommanderEvidenceAdapterBaseInput, unavailableCommanderEvidence } from './evidenceAdapterUtils';
import { exactSupplementalSymbol, supplementalExpiry, supplementalObservedAt, supplementalQuality } from './supplementalEvidenceUtils';

export interface SentimentEvidenceInput extends CommanderEvidenceAdapterBaseInput {
  supplementalBundle?: SupplementalBundle;
}

export function buildSentimentEvidence(input: SentimentEvidenceInput): CommanderEvidenceV1 {
  const sentiment = input.supplementalBundle?.sentiment;
  if (!sentiment) return unavailableCommanderEvidence(input, 'SENTIMENT', 'sentiment_cache_missing');
  if (!exactSupplementalSymbol(input.symbol, sentiment.symbol)) return unavailableCommanderEvidence(input, 'SENTIMENT', 'sentiment_symbol_identity_mismatch', 'INVALID');
  const quality = supplementalQuality(sentiment, input.receivedAt);
  if (quality === 'INVALID') return unavailableCommanderEvidence(input, 'SENTIMENT', 'sentiment_timestamp_or_source_invalid', 'INVALID');
  if (quality === 'NOT_CONFIGURED' || quality === 'MISSING') {
    return unavailableCommanderEvidence(input, 'SENTIMENT', sentiment.reason ?? `sentiment_${sentiment.source}`, quality);
  }
  const data = sentiment.data;
  if (!sentiment.valid || !data) return unavailableCommanderEvidence(input, 'SENTIMENT', 'sentiment_provider_result_not_valid');
  const valueValid = Number.isFinite(data.value) && data.value >= -1 && data.value <= 1;
  const confidenceValid = Number.isFinite(data.confidence) && data.confidence >= 0 && data.confidence <= 1;
  const labelValid = (data.label === 'POSITIVE' && data.value >= 0)
    || (data.label === 'NEGATIVE' && data.value <= 0)
    || (data.label === 'NEUTRAL' && Math.abs(data.value) <= 0.15);
  if (!valueValid || !confidenceValid || !labelValid) {
    return unavailableCommanderEvidence(input, 'SENTIMENT', 'sentiment_payload_invalid', 'INVALID');
  }
  return makeCommanderEvidence({
    ...input,
    observedAt: supplementalObservedAt(sentiment)!,
    expiresAt: supplementalExpiry(sentiment),
    source: sentiment.provider,
    sourceVersion: data.modelVersion ?? input.sourceVersion,
  }, 'SENTIMENT', {
    direction: directionFromSignedScore(data.value, 0.1),
    score: data.value,
    confidence: data.confidence,
    valueQuality: quality,
    supportingReasons: [`provider_label:${data.label.toLowerCase()}`, `provider_score:${data.value.toFixed(4)}`],
    conflictingReasons: data.label === 'NEUTRAL' ? ['provider_sentiment_neutral'] : [],
    rawEvidenceIds: sentiment.sourceArticleRefs?.map((row) => row.id) ?? [sentiment.metadata!.lineageId],
  });
}
