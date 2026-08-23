import type {
  NewsResult,
  OnChainResult,
  SentimentResult,
  SupplementalFetchContext,
  SupplementalProvider,
} from './supplementalTypes';
import {
  fetchHfSpaceFearGreed,
  fetchHfSpaceNews,
  fetchHfSpaceOnChain,
} from '../hfSpaceIntel';
import { analyzeSpace2Sentiment } from '../hfSpacesClient';

function normalizeSymbol(symbol: string): string {
  return String(symbol || '').toUpperCase().replace(/[-_/]?(USDT|USDC|USD|PERP)$/i, '');
}

/**
 * Keyless provider backed only by the two approved Really-amin Spaces.
 * It is always configured because the Spaces are public and their origins are
 * controlled by HF_SPACE_2_ORIGIN / HF_SPACE_4_ORIGIN.
 */
export class HfSpacesNewsProvider implements SupplementalProvider {
  name = 'APEX Hugging Face Spaces';
  category = 'news' as const;

  isConfigured(): boolean { return true; }

  async fetch(symbol: string): Promise<NewsResult> {
    const startedAt = Date.now();
    const result = await fetchHfSpaceNews();
    const usable = result.ok && result.headlines.length > 0;
    return {
      category: 'news',
      provider: result.source,
      symbol,
      data: result.headlines.map((item) => ({
        title: item.title,
        url: item.url || '',
        source: item.source || result.source,
        publishedAt: item.publishedAt || '',
      })),
      source: usable ? 'degraded' : 'unavailable',
      // A 200 whose body no longer matches the expected shape is reported as a
      // schema break rather than being flattened into NO_DATA.
      status: usable ? 'OK' : result.state === 'SCHEMA_MISMATCH' ? 'SCHEMA_MISMATCH' : 'NO_DATA',
      reason: result.detail,
      latencyMs: Date.now() - startedAt,
      updatedAt: new Date().toISOString(),
      diagnostics: {
        state: result.state,
        receivedKeys: result.receivedKeys,
        attempts: result.attempts,
      },
    };
  }
}

export class HfSpacesSentimentProvider implements SupplementalProvider {
  name = 'APEX Hugging Face Spaces';
  category = 'sentiment' as const;

  isConfigured(): boolean { return true; }

  async fetch(
    symbol: string,
    _timeoutMs?: number,
    context?: SupplementalFetchContext,
  ): Promise<SentimentResult> {
    const startedAt = Date.now();
    const corpus = (context?.headlines || [])
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 12);

    if (corpus.length) {
      const analyzed = await analyzeSpace2Sentiment(corpus.join('\n'), 'news');
      if (analyzed) {
        const normalized = analyzed.sentiment === 'Bullish' ? analyzed.confidence
          : analyzed.sentiment === 'Bearish' ? -analyzed.confidence
            : 0;
        return {
          category: 'sentiment',
          valid: true,
          provider: analyzed.source || 'HF Space-2',
          symbol,
          data: {
            value: Math.max(-1, Math.min(1, normalized)),
            label: analyzed.sentiment === 'Bullish' ? 'POSITIVE'
              : analyzed.sentiment === 'Bearish' ? 'NEGATIVE'
                : 'NEUTRAL',
            confidence: analyzed.confidence,
            modelVersion: analyzed.model,
          },
          newsContext: corpus,
          source: 'degraded',
          status: 'OK',
          latencyMs: Date.now() - startedAt,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    const fearGreed = await fetchHfSpaceFearGreed();
    if (fearGreed.ok && typeof fearGreed.value === 'number') {
      const normalized = Math.max(-1, Math.min(1, (fearGreed.value - 50) / 50));
      return {
        category: 'sentiment',
        valid: true,
        provider: fearGreed.source,
        symbol,
        data: {
          value: normalized,
          label: normalized > 0.15 ? 'POSITIVE' : normalized < -0.15 ? 'NEGATIVE' : 'NEUTRAL',
          // The upstream Fear & Greed contract does not expose model confidence.
          // Zero means "not reported", not a synthetic estimate.
          confidence: 0,
          modelVersion: 'fear-greed-index',
        },
        source: 'degraded',
        status: 'OK_NO_CONFIDENCE',
        reason: fearGreed.classification || undefined,
        latencyMs: Date.now() - startedAt,
        updatedAt: new Date().toISOString(),
        diagnostics: {
          state: fearGreed.state,
          attempts: fearGreed.attempts,
        },
      };
    }

    return {
      category: 'sentiment',
          valid: false,
      provider: 'APEX Hugging Face Spaces',
      symbol,
      data: null,
      source: 'unavailable',
      // Distinguish a changed upstream schema from a source that truthfully has
      // nothing to report.
      status: fearGreed.state === 'SCHEMA_MISMATCH' ? 'SCHEMA_MISMATCH' : 'NO_DATA',
      reason: fearGreed.detail || 'Both approved Hugging Face Spaces were unavailable',
      latencyMs: Date.now() - startedAt,
      updatedAt: new Date().toISOString(),
      diagnostics: {
        state: fearGreed.state,
        receivedKeys: fearGreed.receivedKeys,
        attempts: fearGreed.attempts,
      },
    };
  }
}

export class HfSpacesOnChainProvider implements SupplementalProvider {
  name = 'APEX Hugging Face Spaces';
  category = 'onchain' as const;

  isConfigured(): boolean { return true; }

  async fetch(symbol: string): Promise<OnChainResult> {
    const startedAt = Date.now();
    const result = await fetchHfSpaceOnChain(normalizeSymbol(symbol));
    const rows = result.rows
      // APEX exchange-flow logic requires a real directional observation.
      // Generic whale rows without direction remain visible in the feed preview
      // but are not converted into a directional trading signal.
      .filter((row) => row.direction === 'inbound' || row.direction === 'outbound')
      .map((row) => ({
        type: 'whale_transfer' as const,
        amount: row.amount,
        asset: row.asset,
        amountUSD: row.amountUsd,
        direction: row.direction!,
        chain: row.chain || 'unknown',
        blockNumber: row.blockNumber,
        transactionHash: row.transactionHash,
        timestamp: row.timestamp || '',
      }));

    return {
      category: 'onchain',
      provider: result.source,
      symbol,
      data: rows,
      source: result.ok && rows.length ? 'degraded' : 'unavailable',
      // Three distinct facts are kept apart: usable directional signals, valid
      // observations that carried no direction, and an upstream whose response
      // shape changed. Only the last is a schema break.
      status: result.ok && rows.length
        ? 'OK'
        : result.ok
          ? 'NO_DIRECTIONAL_ROWS'
          : result.state === 'SCHEMA_MISMATCH'
            ? 'SCHEMA_MISMATCH'
            : 'NO_DATA',
      reason: result.ok && result.rows.length && !rows.length
        ? 'Hugging Face returned whale rows but no explicit inbound/outbound direction; APEX refused to infer it'
        : result.detail,
      latencyMs: Date.now() - startedAt,
      updatedAt: new Date().toISOString(),
      diagnostics: {
        state: result.state,
        receivedKeys: result.receivedKeys,
        // Valid observations before the directional promotion rule — these are
        // never discarded silently.
        rawObservationCount: result.ok ? result.rows.length : result.rawRowCount,
        attempts: result.attempts,
      },
    };
  }
}
