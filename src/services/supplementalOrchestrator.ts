/* Copied from apex-trading-engine/src/services/supplementalOrchestrator.ts */

import {
  SupplementalResult,
  NewsResult,
  SentimentResult,
  OnChainResult,
  SupplementalProvider,
  SupplementalFetchContext,
  SupplementalBundle,
} from './providers/supplementalTypes';
import { NewsAPIProvider } from './providers/newsProviders';
import type { NewsApiQueryOptions } from './providers/newsApiRequest';
import { AlternativeMeSentimentProvider, HuggingFaceSentimentProvider } from './providers/sentimentProviders';
import { EtherscanProvider, TronScanProvider, BscScanProvider, ClankAppProvider } from './providers/onchainProviders';
import { HfSpacesNewsProvider, HfSpacesSentimentProvider, HfSpacesOnChainProvider } from './providers/hfSpaceProviders';
import { configureUsdPricingFallback } from './providers/usdPricing';
import { createHash } from 'node:crypto';
import {
  canonicalObservationMetadata,
  oldestSourceObservation,
  withCacheStoredAt,
  type EvidenceDependencyFamily,
} from '../contracts/evidence/observationMetadata';

/**
 * Failures are cached briefly so an unreachable provider does not re-burn its
 * full timeout on every poll (three dead on-chain providers at 8s each used to
 * stall /api/supplemental/all for half a minute).
 */
const FAILURE_TTL_MS = 60 * 1000;

function resultLineage(result: SupplementalResult, parentIds: string[]): string {
  const rawIds = result.category === 'news'
    ? result.data.map((row) => row.url)
    : result.category === 'onchain'
      ? result.data.map((row) => row.transactionHash)
      : result.sourceArticleRefs?.map((row) => row.id) ?? [];
  return `${result.category}:${createHash('sha256').update(JSON.stringify([result.provider, result.symbol, rawIds, parentIds])).digest('hex').slice(0, 24)}`;
}

function canonicalizeSupplementalResult<T extends SupplementalResult>(result: T, receivedAt = Date.now()): T {
  const providerReadAt = Number.isFinite(Date.parse(result.updatedAt)) ? Date.parse(result.updatedAt) : receivedAt;
  const sourceObservedAt = result.metadata?.sourceObservedAt ?? (result.category === 'news'
    ? oldestSourceObservation(result.data.map((row) => row.publishedAt))
    : result.category === 'onchain'
      ? oldestSourceObservation(result.data.map((row) => row.timestamp))
      : result.sourceArticleRefs?.length
        ? oldestSourceObservation(result.sourceArticleRefs.map((row) => row.publishedAt))
        : null);
  const dependencyFamily: EvidenceDependencyFamily = result.category === 'news' || result.category === 'sentiment'
    ? 'NEWS_TEXT'
    : 'ONCHAIN_FLOW';
  const parentLineageIds = result.category === 'sentiment'
    ? (result.sourceArticleRefs ?? []).map((row) => `news:${row.id}`)
    : [];
  const qualityState = result.source === 'live'
    ? 'VALID'
    : result.source === 'degraded'
      ? 'DEGRADED'
      : result.source === 'not_configured'
        ? 'NOT_CONFIGURED'
        : 'MISSING';
  return {
    ...result,
    metadata: canonicalObservationMetadata({
      sourceObservedAt,
      providerReadAt,
      receivedAt,
      cacheStoredAt: null,
      provider: result.provider,
      venue: null,
      canonicalInstrumentId: result.symbol,
      providerInstrumentId: result.symbol,
      adapterVersion: 'supplemental_normalizer_v1',
      qualityState,
      staleReason: result.source === 'degraded' ? result.reason ?? 'provider_degraded' : null,
      lineageId: resultLineage(result, parentLineageIds),
      dependencyFamily,
      parentLineageIds,
      decisionEligible: result.source === 'live' && sourceObservedAt !== null,
    }),
  };
}

class SupplementalCache {
  private store = new Map<string, { data: SupplementalResult; expiresAt: number }>();
  private defaultTTL = 5 * 60 * 1000;

  set(key: string, value: SupplementalResult, ttl?: number): SupplementalResult {
    const t = ttl || this.defaultTTL;
    const storedAt = Date.now();
    const valueWithMetadata = withCacheStoredAt(canonicalizeSupplementalResult(value), storedAt);
    this.store.set(key, { data: valueWithMetadata, expiresAt: storedAt + t });
    return valueWithMetadata;
  }

  get(key: string) {
    const e = this.store.get(key);
    if (!e) return null;
    if (Date.now() > e.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return e.data;
  }

  clear() {
    this.store.clear();
  }
}

/**
 * Supplemental Orchestrator
 * Coordinates news, sentiment and on-chain providers
 */
export class SupplementalOrchestrator {
  private newsProviders: SupplementalProvider[] = [];
  private sentimentProviders: SupplementalProvider[] = [];
  private onchainProviders: SupplementalProvider[] = [];
  private cache = new SupplementalCache();

  constructor(config?: {
    newsApiKey?: string;
    newsApiKeys?: string[];
    newsApiQuery?: NewsApiQueryOptions;
    coinMarketCapKey?: string;
    coinMarketCapKeys?: string[];
    huggingFaceToken?: string;
    huggingFaceTokens?: string[];
    etherscanKey?: string;
    etherscanKeys?: string[];
    tronScanKey?: string;
    tronScanKeys?: string[];
    bscScanKey?: string;
    bscScanKeys?: string[];
    timeout?: number;
  }) {
    const timeout = config?.timeout || 8000;
    const unique = (values: Array<string | undefined>): string[] => [...new Set(values.map((value) => value?.trim() || '').filter(Boolean))];
    const newsKeys = unique([...(config?.newsApiKeys || []), config?.newsApiKey]);
    const cmcKeys = unique([...(config?.coinMarketCapKeys || []), config?.coinMarketCapKey]);
    const hfTokens = unique([...(config?.huggingFaceTokens || []), config?.huggingFaceToken]);
    const etherscanKeys = unique([...(config?.etherscanKeys || []), config?.etherscanKey]);
    const tronScanKeys = unique([...(config?.tronScanKeys || []), config?.tronScanKey]);
    const bscScanKeys = unique([...(config?.bscScanKeys || []), config?.bscScanKey]);
    configureUsdPricingFallback({ coinMarketCapKey: cmcKeys[0], coinMarketCapKeys: cmcKeys });

    // Smart supplemental routing: owner-managed Spaces first, then the attached
    // public/keyed fallback pack. Reserve credentials are tried independently;
    // a dead/rate-limited key cannot suppress the next configured key.
    this.newsProviders.push(new HfSpacesNewsProvider());
    newsKeys.forEach((apiKey, index) => {
      const provider = new NewsAPIProvider({ apiKey, timeout, newsApiQuery: config?.newsApiQuery });
      if (index > 0) provider.name = `NewsAPI Reserve ${index + 1}`;
      this.newsProviders.push(provider);
    });

    this.sentimentProviders.push(new HfSpacesSentimentProvider());
    this.sentimentProviders.push(new AlternativeMeSentimentProvider({ timeout }));
    hfTokens.forEach((apiKey, index) => {
      const provider = new HuggingFaceSentimentProvider({ apiKey, timeout });
      if (index > 0) provider.name = `HuggingFace Reserve ${index + 1}`;
      this.sentimentProviders.push(provider);
    });

    this.onchainProviders.push(new HfSpacesOnChainProvider());
    etherscanKeys.forEach((apiKey, index) => {
      const provider = new EtherscanProvider({ apiKey, timeout });
      if (index > 0) provider.name = `Etherscan Reserve ${index + 1}`;
      this.onchainProviders.push(provider);
    });
    tronScanKeys.forEach((apiKey, index) => {
      const provider = new TronScanProvider({ apiKey, timeout });
      if (index > 0) provider.name = `TronScan Reserve ${index + 1}`;
      this.onchainProviders.push(provider);
    });
    const effectiveBscKeys = bscScanKeys.length ? bscScanKeys : etherscanKeys;
    effectiveBscKeys.forEach((apiKey, index) => {
      const provider = new BscScanProvider({ apiKey, timeout });
      if (index > 0) provider.name = `BscScan Reserve ${index + 1}`;
      this.onchainProviders.push(provider);
    });
    this.onchainProviders.push(new ClankAppProvider({ timeout }));
  }

  getProvidersStatus() {
    return {
      news: this.newsProviders.map(p => ({ name: p.name, configured: p.isConfigured() })),
      sentiment: this.sentimentProviders.map(p => ({ name: p.name, configured: p.isConfigured() })),
      onchain: this.onchainProviders.map(p => ({ name: p.name, configured: p.isConfigured() })),
    };
  }

  clearCache() {
    this.cache.clear();
  }

  /** Read only already-cached provider results; never performs network I/O. */
  getCachedBundle(symbol: string): SupplementalBundle {
    const news = this.cache.get(`news:${symbol}`);
    const sentiment = this.cache.get(`sentiment:${symbol}`);
    const onchain = this.cache.get(`onchain:${symbol}`);
    return {
      news: news?.category === 'news' ? news as NewsResult : null,
      sentiment: sentiment?.category === 'sentiment' ? sentiment as SentimentResult : null,
      onchain: onchain?.category === 'onchain' ? onchain as OnChainResult : null,
    };
  }

  async fetchNews(symbol: string, useCache = true): Promise<NewsResult> {
    const cacheKey = `news:${symbol}`;
    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.category === 'news') return cached as NewsResult;
    }

    let lastConfigured: NewsResult | null = null;
    for (const p of this.newsProviders) {
      if (!p.isConfigured()) continue;
      const res = canonicalizeSupplementalResult((await p.fetch(symbol)) as NewsResult);
      lastConfigured = res;
      if (res.source === 'live' || res.source === 'degraded') {
        return this.cache.set(cacheKey, res) as NewsResult;
      }
    }

    if (lastConfigured) {
      return this.cache.set(cacheKey, lastConfigured, FAILURE_TTL_MS) as NewsResult;
    }

    return canonicalizeSupplementalResult({
      category: 'news',
      provider: 'aggregated',
      symbol,
      data: [],
      source: 'not_configured',
      status: 'NOT_CONFIGURED',
      latencyMs: 0,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Headlines already fetched for this symbol, for text-based sentiment models. */
  private cachedHeadlineObservations(symbol: string): Array<{ id: string; title: string; publishedAt: string }> {
    const cached = this.cache.get(`news:${symbol}`);
    if (!cached || cached.category !== 'news') return [];
    return (cached as NewsResult).data
      .filter((article) => Boolean(article.title))
      .map((article) => ({ id: article.url, title: article.title, publishedAt: article.publishedAt }));
  }

  async fetchSentiment(
    symbol: string,
    useCache = true,
    context?: SupplementalFetchContext,
  ): Promise<SentimentResult> {
    const cacheKey = `sentiment:${symbol}`;
    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.category === 'sentiment') return cached as SentimentResult;
    }

    const headlineObservations = context?.headlineObservations?.length
      ? context.headlineObservations
      : this.cachedHeadlineObservations(symbol);
    const headlines = context?.headlines?.length ? context.headlines : headlineObservations.map((row) => row.title);

    let lastConfigured: SentimentResult | null = null;
    for (const p of this.sentimentProviders) {
      const fetched = (await p.fetch(symbol, undefined, { headlines, headlineObservations })) as SentimentResult;
      const res = canonicalizeSupplementalResult({
        ...fetched,
        ...(headlineObservations.length ? { sourceArticleRefs: headlineObservations.map(({ id, publishedAt }) => ({ id, publishedAt })) } : {}),
      });
      if (p.isConfigured()) lastConfigured = res;
      if (res.source === 'live' || res.source === 'degraded') {
        return this.cache.set(cacheKey, res) as SentimentResult;
      }
    }

    // Prefer the last configured provider's typed failure over a synthetic
    // NOT_CONFIGURED when keyless providers (e.g. Alternative.me) were tried.
    if (lastConfigured) {
      return this.cache.set(cacheKey, lastConfigured, FAILURE_TTL_MS) as SentimentResult;
    }

    return canonicalizeSupplementalResult({
      category: 'sentiment',
      valid: false,
      provider: 'aggregated',
      symbol,
      data: null,
      source: 'not_configured',
      status: 'NOT_CONFIGURED',
      latencyMs: 0,
      updatedAt: new Date().toISOString(),
    });
  }

  async fetchOnChain(symbol: string, useCache = true): Promise<OnChainResult> {
    const cacheKey = `onchain:${symbol}`;
    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.category === 'onchain') return cached as OnChainResult;
    }

    let lastConfigured: OnChainResult | null = null;
    const attempts: OnChainResult[] = [];
    for (const p of this.onchainProviders) {
      if (!p.isConfigured()) continue;
      const res = canonicalizeSupplementalResult((await p.fetch(symbol)) as OnChainResult);
      lastConfigured = res;
      attempts.push(res);
      if (res.source === 'live' || res.source === 'degraded') {
        return this.cache.set(cacheKey, res) as OnChainResult;
      }
    }

    if (lastConfigured) {
      // Report the whole attempted chain, not just the last link. This keeps
      // unsupported-symbol and configured-explorer failures explicit.
      const unsupported = attempts.filter((a) => a.status === 'UNSUPPORTED_SYMBOL');
      const failed = attempts.filter((a) => a.status !== 'UNSUPPORTED_SYMBOL');
      const parts: string[] = [];
      if (unsupported.length > 0) {
        parts.push(`${symbol} is not tracked by ${unsupported.map((a) => a.provider).join(', ')}`);
      }
      for (const f of failed) {
        parts.push(`${f.provider}: ${f.reason || f.status}`);
      }
      const aggregated: OnChainResult = {
        ...lastConfigured,
        provider: attempts.length > 1 ? 'aggregated' : lastConfigured.provider,
        reason: parts.length > 0 ? parts.join(' · ') : lastConfigured.reason,
      };
      return this.cache.set(cacheKey, aggregated, FAILURE_TTL_MS) as OnChainResult;
    }

    return canonicalizeSupplementalResult({
      category: 'onchain',
      provider: 'aggregated',
      symbol,
      data: [],
      source: 'not_configured',
      status: 'NOT_CONFIGURED',
      latencyMs: 0,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * News resolves first so the sentiment model scores real headlines; on-chain
   * runs alongside since it needs nothing from the others.
   */
  /**
   * Bounded scanner enrichment. This deliberately performs network work only
   * for a top-N shortlist so supplemental evidence cannot depend on whether a
   * user happened to open a symbol page and warm its cache.
   */
  async prefetchShortlist(
    symbols: readonly string[],
    options: { limit?: number; concurrency?: number } = {},
  ): Promise<Array<{ symbol: string; ok: boolean }>> {
    const unique = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
    const limit = Math.max(0, Math.min(options.limit ?? 6, unique.length));
    const rows = unique.slice(0, limit);
    if (!rows.length) return [];
    const concurrency = Math.max(1, Math.min(options.concurrency ?? 2, 4, rows.length));
    const results = new Array<{ symbol: string; ok: boolean }>(rows.length);
    let cursor = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (cursor < rows.length) {
        const index = cursor++;
        const symbol = rows[index];
        try {
          await this.fetchAll(symbol);
          results[index] = { symbol, ok: true };
        } catch {
          // Unavailable supplemental evidence remains unavailable. The scanner
          // must not synthesize a substitute merely to complete enrichment.
          results[index] = { symbol, ok: false };
        }
      }
    });
    await Promise.all(workers);
    return results;
  }

  async fetchAll(symbol: string) {
    const onchainP = this.fetchOnChain(symbol);
    const news = await this.fetchNews(symbol);
    const headlineObservations = news.data
      .filter((article) => Boolean(article.title))
      .map((article) => ({ id: article.url, title: article.title, publishedAt: article.publishedAt }));
    const headlines = headlineObservations.map((row) => row.title);
    const [sentiment, onchain] = await Promise.all([
      this.fetchSentiment(symbol, true, { headlines, headlineObservations }),
      onchainP,
    ]);
    return { news, sentiment, onchain };
  }
}

let instance: SupplementalOrchestrator | null = null;

export function initializeSupplementalOrchestrator(config?: {
  newsApiKey?: string;
  newsApiKeys?: string[];
  newsApiQuery?: NewsApiQueryOptions;
  coinMarketCapKey?: string;
  coinMarketCapKeys?: string[];
  huggingFaceToken?: string;
  huggingFaceTokens?: string[];
  etherscanKey?: string;
  etherscanKeys?: string[];
  tronScanKey?: string;
  tronScanKeys?: string[];
  bscScanKey?: string;
  bscScanKeys?: string[];
  timeout?: number;
}) {
  instance = new SupplementalOrchestrator(config);
  return instance;
}

export function getSupplementalOrchestrator() {
  if (!instance) {
    // initialize from environment if available
    instance = new SupplementalOrchestrator({
      newsApiKey: process.env.NEWSAPI_KEY,
      huggingFaceToken: process.env.HUGGING_FACE_TOKEN,
      etherscanKey: process.env.ETHERSCAN_KEY,
      tronScanKey: process.env.TRONSCAN_KEY,
      // Prefer a dedicated BSC key when the operator provides one. The
      // constructor deliberately falls back to ETHERSCAN_KEY for Etherscan V2
      // chainid=56 only when BSCSCAN_KEY is absent.
      bscScanKey: process.env.BSCSCAN_KEY,
    });
  }
  return instance;
}

export default getSupplementalOrchestrator();
