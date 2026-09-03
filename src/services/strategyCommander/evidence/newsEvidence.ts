import type { CommanderEvidenceV1 } from '../../../contracts/commander/commanderEvidence';
import type { SupplementalBundle } from '../../providers/supplementalTypes';
import { directionFromSignedScore, makeCommanderEvidence, type CommanderEvidenceAdapterBaseInput, unavailableCommanderEvidence } from './evidenceAdapterUtils';
import { exactSupplementalSymbol, supplementalExpiry, supplementalObservedAt, supplementalQuality } from './supplementalEvidenceUtils';

export interface NewsEvidenceInput extends CommanderEvidenceAdapterBaseInput {
  supplementalBundle?: SupplementalBundle;
}

export function buildNewsEvidence(input: NewsEvidenceInput): CommanderEvidenceV1 {
  const news = input.supplementalBundle?.news;
  if (!news) return unavailableCommanderEvidence(input, 'NEWS', 'news_cache_missing');
  if (!exactSupplementalSymbol(input.symbol, news.symbol)) return unavailableCommanderEvidence(input, 'NEWS', 'news_symbol_identity_mismatch', 'INVALID');
  const quality = supplementalQuality(news, input.receivedAt);
  if (quality === 'INVALID') return unavailableCommanderEvidence(input, 'NEWS', 'news_timestamp_or_source_invalid', 'INVALID');
  if (quality === 'NOT_CONFIGURED' || quality === 'MISSING') {
    return unavailableCommanderEvidence(input, 'NEWS', news.reason ?? `news_${news.source}`, quality);
  }
  const labeled = news.data.filter((article) => article.sentiment === 'bullish' || article.sentiment === 'bearish' || article.sentiment === 'neutral');
  if (!labeled.length) return unavailableCommanderEvidence(input, 'NEWS', 'news_explicit_sentiment_labels_missing');
  const signs = labeled.map((article) => article.sentiment === 'bullish' ? 1 : article.sentiment === 'bearish' ? -1 : 0);
  const score = signs.reduce<number>((sum, sign) => sum + sign, 0) / signs.length;
  const directionalCoverage = labeled.length / Math.max(news.data.length, 1);
  const confidence = Math.min(1, labeled.length / 5) * directionalCoverage;
  return makeCommanderEvidence({
    ...input,
    observedAt: supplementalObservedAt(news)!,
    expiresAt: supplementalExpiry(news),
    source: news.provider,
  }, 'NEWS', {
    direction: directionFromSignedScore(score, 0.1),
    score,
    confidence,
    valueQuality: quality,
    supportingReasons: [`explicit_labeled_articles:${labeled.length}`, `directional_label_mean:${score.toFixed(4)}`],
    conflictingReasons: score === 0 ? ['explicit_news_labels_balanced'] : [],
    rawEvidenceIds: labeled.map((article) => article.url).filter(Boolean),
  });
}
