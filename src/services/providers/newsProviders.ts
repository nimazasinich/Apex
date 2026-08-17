/* Copied from apex-trading-engine/src/services/providers/newsProviders.ts */

import {
  SupplementalProvider,
  ProviderConfig,
  NewsResult,
} from './supplementalTypes';
import {
  normalizeNewsApiQuery,
  type NewsApiQueryOptions,
} from './newsApiRequest';
import { fetchCryptoNewsArticles } from './newsApiServerFetch';

export class NewsAPIProvider implements SupplementalProvider {
  name = 'NewsAPI';
  category = 'news' as const;
  private apiKey: string | undefined;
  private timeout: number;
  private queryOptions: NewsApiQueryOptions;

  constructor(config?: ProviderConfig) {
    this.apiKey = config?.apiKey;
    this.timeout = config?.timeout || 8000;
    this.queryOptions = normalizeNewsApiQuery(config?.newsApiQuery);
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async fetch(symbol: string, timeoutMs?: number): Promise<NewsResult> {
    const startTime = Date.now();
    const tmo = timeoutMs || this.timeout;

    if (!this.isConfigured()) {
      return {
        category: 'news',
        provider: this.name,
        symbol,
        data: [],
        source: 'not_configured',
        status: 'NOT_CONFIGURED',
        reason: 'NewsAPI key not set in environment',
        latencyMs: 0,
        updatedAt: new Date().toISOString(),
      };
    }

    if (/^(secret|test|dummy|placeholder)[-_]/i.test(this.apiKey ?? '')) {
      return {
        category: 'news',
        provider: this.name,
        symbol,
        data: [],
        source: 'unavailable',
        status: 'UNAUTHORIZED',
        reason: 'NewsAPI key is invalid or revoked',
        latencyMs: Date.now() - startTime,
        updatedAt: new Date().toISOString(),
      };
    }

    try {
      const apiKey = this.apiKey!;
      const result = await fetchCryptoNewsArticles(apiKey, symbol, this.queryOptions, tmo);

      if (result.apiCode === 'networkError') {
        return {
          category: 'news',
          provider: this.name,
          symbol,
          data: [],
          source: 'unavailable',
          status: 'UNREACHABLE',
          reason: result.apiMessage || 'NewsAPI unreachable from server network',
          latencyMs: result.latencyMs,
          updatedAt: new Date().toISOString(),
        };
      }

      if (result.apiCode === 'apiKeyInvalid' || result.apiCode === 'apiKeyMissing' || result.status === 401) {
        return {
          category: 'news',
          provider: this.name,
          symbol,
          data: [],
          source: 'unavailable',
          status: 'UNAUTHORIZED',
          reason: result.apiMessage || 'NewsAPI key is invalid or revoked',
          latencyMs: result.latencyMs,
          updatedAt: new Date().toISOString(),
        };
      }

      if (result.status === 429) {
        return {
          category: 'news',
          provider: this.name,
          symbol,
          data: [],
          source: 'degraded',
          status: 'RATE_LIMITED',
          reason: 'NewsAPI rate limit exceeded',
          latencyMs: result.latencyMs,
          updatedAt: new Date().toISOString(),
        };
      }

      if (!result.ok) {
        return {
          category: 'news',
          provider: this.name,
          symbol,
          data: [],
          source: 'unavailable',
          status: result.apiCode || `HTTP_${result.status}`,
          reason: result.apiMessage || `NewsAPI returned HTTP ${result.status}`,
          latencyMs: result.latencyMs,
          updatedAt: new Date().toISOString(),
        };
      }

      const articles = result.articles;

      if (articles.length === 0) {
        const filteredEverything = result.returned > 0 && result.filteredOut >= result.returned;
        return {
          category: 'news',
          provider: this.name,
          symbol,
          data: [],
          source: 'degraded',
          status: filteredEverything ? 'NO_CRYPTO_RESULTS' : 'NO_RESULTS',
          reason: filteredEverything
            ? `All ${result.returned} headlines were off-topic for crypto. Widen the lookback or relax the crypto-only filter in Settings.`
            : 'NewsAPI returned no articles for this query window',
          latencyMs: result.latencyMs,
          updatedAt: new Date().toISOString(),
        };
      }

      return {
        category: 'news',
        provider: this.name,
        symbol,
        data: articles,
        source: 'live',
        status: 'OK',
        reason:
          result.filteredOut > 0
            ? `${result.filteredOut} non-crypto headline${result.filteredOut === 1 ? '' : 's'} filtered out`
            : undefined,
        latencyMs: result.latencyMs,
        updatedAt: new Date().toISOString(),
      };
    } catch (err) {
      const latency = Date.now() - startTime;
      const reason =
        err instanceof Error
          ? err.message.includes('abort')
            ? 'Request timeout'
            : err.message
          : 'Unknown error';

      return {
        category: 'news',
        provider: this.name,
        symbol,
        data: [],
        source: 'unavailable',
        status: 'FETCH_FAILED',
        reason,
        latencyMs: latency,
        updatedAt: new Date().toISOString(),
      };
    }
  }
}
