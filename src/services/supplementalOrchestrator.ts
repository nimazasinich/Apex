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
import { HuggingFaceSentimentProvider } from './providers/sentimentProviders';
import { EtherscanProvider, TronScanProvider, BscScanProvider } from './providers/onchainProviders';
import { HfSpacesNewsProvider, HfSpacesSentimentProvider, HfSpacesOnChainProvider } from './providers/hfSpaceProviders';
import { configureUsdPricingFallback } from './providers/usdPricing';

/**
 * Failures are cached briefly so an unreachable provider does not re-burn its
 * full timeout on every poll (three dead on-chain providers at 8s each used to
 * stall /api/supplemental/all for half a minute).
 */
const FAILURE_TTL_MS = 60 * 1000;

class SupplementalCache {
  private store = new Map<string, { data: SupplementalResult; expiresAt: number }>();
  private defaultTTL = 5 * 60 * 1000;

  set(key: string, value: SupplementalResult, ttl?: number) {
    const t = ttl || this.defaultTTL;
    this.store.set(key, { data: value, expiresAt: Date.now() + t });
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
    newsApiQuery?: NewsApiQueryOptions;
    coinMarketCapKey?: string;
    huggingFaceToken?: string;
    etherscanKey?: string;
    tronScanKey?: string;
    bscScanKey?: string;
    timeout?: number;
  }) {
    const timeout = config?.timeout || 8000;
    configureUsdPricingFallback({ coinMarketCapKey: config?.coinMarketCapKey });

    // Provider order is intentional and owner-approved:
    // approved public Hugging Face Spaces first; user-entered API credentials last.
    // Market-price routing is handled separately by intelligenceFeedProbe.
    this.newsProviders.push(new HfSpacesNewsProvider());
    if (config?.newsApiKey) {
      this.newsProviders.push(new NewsAPIProvider({
        apiKey: config.newsApiKey,
        timeout,
        newsApiQuery: config.newsApiQuery,
      }));
    }

    this.sentimentProviders.push(new HfSpacesSentimentProvider());
    // The operator-entered inference token is the final sentiment tier. APEX
    // does not insert unrelated direct public sentiment APIs between the
    // owner-managed Spaces and configured credentials.
    if (config?.huggingFaceToken) {
      this.sentimentProviders.push(new HuggingFaceSentimentProvider({ apiKey: config.huggingFaceToken, timeout }));
    }

    this.onchainProviders.push(new HfSpacesOnChainProvider());
    // User-entered explorer credentials are the final on-chain tier.
    if (config?.etherscanKey) this.onchainProviders.push(new EtherscanProvider({ apiKey: config.etherscanKey, timeout }));
    if (config?.tronScanKey) this.onchainProviders.push(new TronScanProvider({ apiKey: config.tronScanKey, timeout }));
    // BSC via Etherscan V2 (chainid 56). A dedicated BscScan key is used when
    // present; otherwise the Etherscan key covers BSC under the unified API.
    const bscKey = config?.bscScanKey || config?.etherscanKey;
    if (bscKey) this.onchainProviders.push(new BscScanProvider({ apiKey: bscKey, timeout }));
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
      const res = (await p.fetch(symbol)) as NewsResult;
      lastConfigured = res;
      if (res.source === 'live' || res.source === 'degraded') {
        this.cache.set(cacheKey, res);
        return res;
      }
    }

    if (lastConfigured) {
      this.cache.set(cacheKey, lastConfigured, FAILURE_TTL_MS);
      return lastConfigured;
    }

    return {
      category: 'news',
      provider: 'aggregated',
      symbol,
      data: [],
      source: 'not_configured',
      status: 'NOT_CONFIGURED',
      latencyMs: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  /** Headlines already fetched for this symbol, for text-based sentiment models. */
  private cachedHeadlines(symbol: string): string[] {
    const cached = this.cache.get(`news:${symbol}`);
    if (!cached || cached.category !== 'news') return [];
    return (cached as NewsResult).data.map((a) => a.title).filter(Boolean);
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

    const headlines = context?.headlines?.length ? context.headlines : this.cachedHeadlines(symbol);

    let lastConfigured: SentimentResult | null = null;
    for (const p of this.sentimentProviders) {
      const res = (await p.fetch(symbol, undefined, { headlines })) as SentimentResult;
      if (p.isConfigured()) lastConfigured = res;
      if (res.source === 'live' || res.source === 'degraded') {
        this.cache.set(cacheKey, res);
        return res;
      }
    }

    // Prefer the last configured provider's typed failure over a synthetic
    // NOT_CONFIGURED when keyless providers (e.g. Alternative.me) were tried.
    if (lastConfigured) {
      this.cache.set(cacheKey, lastConfigured, FAILURE_TTL_MS);
      return lastConfigured;
    }

    return {
      category: 'sentiment',
      valid: false,
      provider: 'aggregated',
      symbol,
      data: null,
      source: 'not_configured',
      status: 'NOT_CONFIGURED',
      latencyMs: 0,
      updatedAt: new Date().toISOString(),
    };
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
      const res = (await p.fetch(symbol)) as OnChainResult;
      lastConfigured = res;
      attempts.push(res);
      if (res.source === 'live' || res.source === 'degraded') {
        this.cache.set(cacheKey, res);
        return res;
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
      this.cache.set(cacheKey, aggregated, FAILURE_TTL_MS);
      return aggregated;
    }

    return {
      category: 'onchain',
      provider: 'aggregated',
      symbol,
      data: [],
      source: 'not_configured',
      status: 'NOT_CONFIGURED',
      latencyMs: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * News resolves first so the sentiment model scores real headlines; on-chain
   * runs alongside since it needs nothing from the others.
   */
  async fetchAll(symbol: string) {
    const onchainP = this.fetchOnChain(symbol);
    const news = await this.fetchNews(symbol);
    const headlines = news.data.map((a) => a.title).filter(Boolean);
    const [sentiment, onchain] = await Promise.all([
      this.fetchSentiment(symbol, true, { headlines }),
      onchainP,
    ]);
    return { news, sentiment, onchain };
  }
}

let instance: SupplementalOrchestrator | null = null;

export function initializeSupplementalOrchestrator(config?: {
  newsApiKey?: string;
  newsApiQuery?: NewsApiQueryOptions;
  coinMarketCapKey?: string;
  huggingFaceToken?: string;
  etherscanKey?: string;
  tronScanKey?: string;
  bscScanKey?: string;
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
