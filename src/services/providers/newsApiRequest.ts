/**
 * NewsAPI.org v2 request builder — aligned with official docs:
 * https://newsapi.org/docs/endpoints/everything
 * https://newsapi.org/docs/authentication
 */

import type { NewsArticle } from './supplementalTypes';

export type NewsApiEndpoint = 'everything' | 'top-headlines';
export type NewsApiSortBy = 'relevancy' | 'popularity' | 'publishedAt';

/** Non-secret query options persisted in Settings (safe to expose to the browser). */
export interface NewsApiQueryOptions {
  endpoint?: NewsApiEndpoint;
  sortBy?: NewsApiSortBy;
  language?: string;
  pageSize?: number;
  lookbackDays?: number;
  domains?: string;
  excludeDomains?: string;
  searchIn?: string;
  sources?: string;
  category?: string;
  country?: string;
  includeCryptoTerms?: boolean;
  /**
   * Drop headlines that carry no cryptocurrency term. NewsAPI matches `q`
   * against the full article body, so crypto publishers leak general world
   * news (their "appeared first on Crypto Briefing" footer matches "crypto").
   */
  cryptoOnly?: boolean;
}

export const DEFAULT_NEWSAPI_QUERY: NewsApiQueryOptions = {
  endpoint: 'everything',
  sortBy: 'publishedAt',
  language: 'en',
  pageSize: 10,
  lookbackDays: 7,
  // Headline + snippet only: the article body is where publisher boilerplate
  // lives, and matching it is what pulls in non-crypto news.
  searchIn: 'title,description',
  includeCryptoTerms: true,
  cryptoOnly: true,
};

/** NewsAPI accepts only these `searchIn` fields; anything else is a 400. */
const SEARCH_IN_FIELDS = ['title', 'description', 'content'] as const;

export function sanitizeSearchIn(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const fields = raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part): part is (typeof SEARCH_IN_FIELDS)[number] =>
      (SEARCH_IN_FIELDS as readonly string[]).includes(part),
    );
  return fields.length > 0 ? Array.from(new Set(fields)).join(',') : undefined;
}

const SYMBOL_QUERY: Record<string, string> = {
  BTCUSDT: 'Bitcoin',
  BTC: 'Bitcoin',
  XBTUSDTM: 'Bitcoin',
  ETHUSDT: 'Ethereum',
  ETH: 'Ethereum',
  BNBUSDT: 'Binance',
  BNB: 'Binance',
  SOLUSDT: 'Solana',
  SOL: 'Solana',
  AVAXUSDT: 'Avalanche',
  AVAX: 'Avalanche',
  SUIUSDT: 'Sui',
  SUI: 'Sui',
  XRPUSDT: 'Ripple',
  XRP: 'Ripple',
  DOGEUSDT: 'Dogecoin',
  DOGE: 'Dogecoin',
};

export function normalizeNewsApiQuery(raw?: Partial<NewsApiQueryOptions> | null): NewsApiQueryOptions {
  const merged = { ...DEFAULT_NEWSAPI_QUERY, ...(raw ?? {}) };
  const pageSize = Number(merged.pageSize);
  const lookbackDays = Number(merged.lookbackDays);
  return {
    ...merged,
    endpoint: merged.endpoint === 'top-headlines' ? 'top-headlines' : 'everything',
    sortBy: merged.sortBy === 'relevancy' || merged.sortBy === 'popularity' ? merged.sortBy : 'publishedAt',
    language: (merged.language || 'en').trim().slice(0, 2).toLowerCase() || 'en',
    pageSize: Number.isFinite(pageSize) ? Math.max(1, Math.min(100, Math.floor(pageSize))) : 10,
    lookbackDays: Number.isFinite(lookbackDays) ? Math.max(0, Math.min(30, Math.floor(lookbackDays))) : 7,
    domains: merged.domains?.trim() || undefined,
    excludeDomains: merged.excludeDomains?.trim() || undefined,
    searchIn: sanitizeSearchIn(merged.searchIn) ?? DEFAULT_NEWSAPI_QUERY.searchIn,
    sources: merged.sources?.trim() || undefined,
    category: merged.category?.trim() || undefined,
    country: merged.country?.trim().slice(0, 2).toLowerCase() || undefined,
    includeCryptoTerms: merged.includeCryptoTerms !== false,
    cryptoOnly: merged.cryptoOnly !== false,
  };
}

/** The coin label a symbol resolves to, e.g. BTCUSDT → Bitcoin. */
export function resolveSymbolLabel(symbol: string): string {
  const clean = symbol.replace(/[-_/]/g, '').toUpperCase();
  return (
    SYMBOL_QUERY[clean] ||
    SYMBOL_QUERY[clean.replace(/USDTM?$/, '')] ||
    symbol.replace(/[-_/]/g, ' ').trim()
  );
}

export function mapSymbolToNewsQuery(symbol: string, includeCryptoTerms = true): string {
  const label = resolveSymbolLabel(symbol);
  const parts = [`"${label}"`, label.toLowerCase()];
  if (includeCryptoTerms) parts.push('cryptocurrency', 'crypto');
  return parts.join(' OR ');
}

// ── Crypto relevance ─────────────────────────────────────────────────────────

/**
 * Cryptocurrency vocabulary used to keep the feed on-topic. Deliberately
 * excludes short ambiguous tickers (LINK, DOT, ADA, SOL) and generic finance
 * words that would let unrelated market news back in.
 */
const CRYPTO_PATTERN =
  /\b(?:crypto(?!graph|log)\w*|bitcoin\w*|btc|satoshi\w*|ethereum|ether|eth|altcoin\w*|memecoin\w*|shitcoin\w*|stablecoin\w*|blockchain\w*|on-?chain|defi|dex|web3|nft\w*|binance|coinbase|kraken|bitfinex|okx|bybit|kucoin|bitget|tether|usdt|usdc|rlusd|solana|cardano|polkadot|ripple labs|ripplenet|xrp|dogecoin|doge|shiba inu|avalanche|avax|chainlink|litecoin|ltc|tron|trx|matic|aptos|toncoin|monero|hodl|halving|tokeni[sz]\w*|digital asset\w*|spot etf|mining rig|hash rate|hashrate|cold wallet|hot wallet|whale wallet)\b/i;

/**
 * Coin names and tickers that are also ordinary English words. They are fine in
 * a NewsAPI query (nothing better exists) but must never be what proves an
 * article is crypto — "could ripple through markets" and "Sol" would let sports
 * and weather copy in.
 */
const AMBIGUOUS_TERMS = new Set([
  'ripple', 'polygon', 'ether', 'tron', 'sui', 'sol', 'dot', 'ada', 'link',
  'one', 'arb', 'ton', 'ape', 'sand', 'win', 'fun', 'key', 'gas', 'cake', 'bal',
]);

/**
 * Publisher boilerplate that syndication feeds append to `description`. It
 * frequently contains the outlet's name ("Crypto Briefing"), which would
 * otherwise mark every article from that outlet as crypto-related.
 */
function stripPublisherBoilerplate(text: string): string {
  return text
    .replace(/\bthe post\b[\s\S]*?\bappeared first on\b[^.]*\.?/gi, ' ')
    .replace(/\bappeared first on\b[^.]*\.?/gi, ' ')
    .replace(/\b(?:read more|continue reading|source)\s*(?:on|at)\b[^.]*\.?/gi, ' ');
}

/**
 * Aggregators bolt a crypto hook onto the end of an unrelated story — "South
 * Korea plans investment in AI infrastructure, with ripple effects for crypto".
 * The hook is what NewsAPI matched, so relevance is judged on the main clause.
 */
const RELEVANCE_HOOK_PATTERN =
  /\s*(?:,|;|—|–|-|\.)\s*(?:and\s+|but\s+)?(?:with|amid)?\s*(?:ripple effects?|knock-?on effects?|implications?|consequences?|lessons?)\s+for\b.*$|\s*(?:,|;|—|–|-)\s*(?:and\s+)?(?:here'?s\s+)?(?:what|why|how)\s+it\s+means\s+for\b.*$|\s*(?:,|;|—|–|-)\s*(?:and\s+)?\w[\w\s]*\s+should\s+(?:pay attention|take note|care|watch)\b.*$/i;

function stripRelevanceHook(text: string): string {
  return text.replace(RELEVANCE_HOOK_PATTERN, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when the headline or its snippet actually talks about crypto. Extra
 * terms let a tracked symbol's own name count (e.g. PEPE, SUI) without
 * widening the shared vocabulary.
 */
export function isCryptoRelevantArticle(
  article: Pick<NewsArticle, 'title' | 'description'>,
  extraTerms: string[] = [],
): boolean {
  const rawTitle = article.title ?? '';
  const title = stripRelevanceHook(rawTitle);
  const extras = extraTerms
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
  const matches = (text: string) =>
    CRYPTO_PATTERN.test(text) ||
    (extras.length > 0 &&
      new RegExp(`\\b(?:${extras.map(escapeRegExp).join('|')})\\b`, 'i').test(text));

  // A headline that ends in a bolted-on crypto hook is judged on its main clause
  // alone. Its snippet repeats the same hook, so consulting it would readmit the
  // article through the back door.
  if (RELEVANCE_HOOK_PATTERN.test(rawTitle)) return matches(title);

  const description = stripRelevanceHook(stripPublisherBoilerplate(article.description ?? ''));
  return matches(`${title} ${description}`);
}

export function filterCryptoRelevantArticles<T extends Pick<NewsArticle, 'title' | 'description'>>(
  articles: T[],
  extraTerms: string[] = [],
): T[] {
  return articles.filter((article) => isCryptoRelevantArticle(article, extraTerms));
}

/**
 * Terms that may vouch for an article being about this symbol — the coin name
 * and bare ticker, minus anything that doubles as an ordinary word. Majors are
 * already in the shared vocabulary, so this mainly serves long-tail tickers.
 */
export function relevanceTermsForSymbol(symbol: string): string[] {
  const label = resolveSymbolLabel(symbol);
  const base = symbol.replace(/[-_/]/g, '').toUpperCase().replace(/USDTM?$/, '');
  return [label, base]
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !AMBIGUOUS_TERMS.has(term.toLowerCase()));
}

// ── Headline tone ────────────────────────────────────────────────────────────

/**
 * Directional lexicon for headline tone. This is a transparent keyword count,
 * not a model: the UI labels it as headline tone, and the composite bias treats
 * it as one weighted input among several.
 */
const BULLISH_PATTERN =
  /\b(?:surge\w*|soar\w*|rally|rallies|rallied|jump\w*|climb\w*|gain\w*|rise|rises|rising|rose|record high|all-?time high|ath|breakout|bullish|bull run|upgrade\w*|approval|approved|adopt\w*|inflow\w*|accumulat\w*|buy\w*|partner\w*|launch\w*|upside|rebound\w*|recover\w*|outperform\w*|boost\w*|surpass\w*|milestone|optimis\w*|green)\b/gi;

const BEARISH_PATTERN =
  /\b(?:plunge\w*|plummet\w*|crash\w*|slump\w*|tumble\w*|sink\w*|drop\w*|fall\w*|fell|decline\w*|sell-?off|liquidat\w*|hack\w*|exploit\w*|breach\w*|scam\w*|fraud\w*|lawsuit\w*|sue[ds]?|ban|banned|crackdown|probe|warn\w*|fear\w*|bearish|dump\w*|outflow\w*|downgrade\w*|delist\w*|bankrupt\w*|insolven\w*|freeze|froze|frozen|seiz\w*|arrest\w*|correction|capitulat\w*|downside|loss|losses|slide[sd]?|slid|weak\w*|risk\w*|halt\w*)\b/gi;

function countMatches(text: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  return (text.match(pattern) ?? []).length;
}

/**
 * Feeds NewsAPI indexes that are not journalism: package registries publish a
 * release note per version, and those mention crypto often enough to survive
 * the vocabulary check.
 */
const NOISE_SOURCE_PATTERN = /\b(?:pypi|npm|npmjs|libraries\.io|packagist|rubygems|crates\.io|github)\b/i;

export function isNewsroomArticle(
  article: Pick<NewsArticle, 'source' | 'url' | 'title'>,
): boolean {
  if (NOISE_SOURCE_PATTERN.test(article.source ?? '')) return false;
  if (NOISE_SOURCE_PATTERN.test(article.url ?? '')) return false;
  // "some-package 1.2.3" — a version bump, not a headline.
  return !/^[\w@./-]+\s+v?\d+\.\d+(?:\.\d+)?$/.test((article.title ?? '').trim());
}

/** True when the headline itself — not just the snippet — is about crypto. */
export function isCryptoHeadline(article: Pick<NewsArticle, 'title'>, extraTerms: string[] = []): boolean {
  return isCryptoRelevantArticle({ title: article.title, description: '' }, extraTerms);
}

/** Keyword-derived tone for a headline; falls back to the snippet if the title is flat. */
export function tagArticleSentiment(
  article: Pick<NewsArticle, 'title' | 'description'>,
): 'bullish' | 'bearish' | 'neutral' {
  const candidates = [
    article.title ?? '',
    stripPublisherBoilerplate(article.description ?? ''),
  ];
  for (const text of candidates) {
    if (!text.trim()) continue;
    const score = countMatches(text, BULLISH_PATTERN) - countMatches(text, BEARISH_PATTERN);
    if (score > 0) return 'bullish';
    if (score < 0) return 'bearish';
  }
  return 'neutral';
}

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Math.max(0, days));
  return d.toISOString().slice(0, 10);
}

export function buildNewsApiRequestUrl(
  apiKey: string,
  symbol: string,
  options?: Partial<NewsApiQueryOptions>,
): URL {
  const query = normalizeNewsApiQuery(options);
  const endpoint = query.endpoint === 'top-headlines' ? 'top-headlines' : 'everything';
  const url = new URL(`https://newsapi.org/v2/${endpoint}`);

  if (endpoint === 'everything') {
    const q = mapSymbolToNewsQuery(symbol, query.includeCryptoTerms);
    url.searchParams.set('q', q);
    if (query.sortBy) url.searchParams.set('sortBy', query.sortBy);
    if (query.language) url.searchParams.set('language', query.language);
    if (query.pageSize) url.searchParams.set('pageSize', String(query.pageSize));
    if (query.lookbackDays && query.lookbackDays > 0) {
      url.searchParams.set('from', isoDateDaysAgo(query.lookbackDays));
    }
    if (query.domains) url.searchParams.set('domains', query.domains);
    if (query.excludeDomains) url.searchParams.set('excludeDomains', query.excludeDomains);
    if (query.searchIn) url.searchParams.set('searchIn', query.searchIn);
    if (query.sources) url.searchParams.set('sources', query.sources);
  } else {
    if (query.sources) url.searchParams.set('sources', query.sources);
    url.searchParams.set('q', mapSymbolToNewsQuery(symbol, query.includeCryptoTerms));
    if (query.category) url.searchParams.set('category', query.category);
    if (query.language) url.searchParams.set('language', query.language);
    if (query.country) url.searchParams.set('country', query.country);
    if (query.pageSize) url.searchParams.set('pageSize', String(query.pageSize));
  }

  // Auth via query is supported by NewsAPI but we prefer the X-Api-Key header at fetch time.
  // Never append apiKey to the URL string returned to logs/UI.
  void apiKey;
  return url;
}

/** Newsdata.io request builder retained behind the existing news-provider interface. */
export function buildNewsDataIoRequestUrl(
  apiKey: string,
  symbol: string,
  options?: Partial<NewsApiQueryOptions>,
): URL {
  const query = normalizeNewsApiQuery(options);
  const url = new URL('https://newsdata.io/api/1/news');
  url.searchParams.set('apikey', apiKey.trim());
  url.searchParams.set('q', mapSymbolToNewsQuery(symbol, query.includeCryptoTerms));
  if (query.language) url.searchParams.set('language', query.language);
  if (query.pageSize) url.searchParams.set('size', String(query.pageSize));
  if (query.category) url.searchParams.set('category', query.category);
  if (query.country) url.searchParams.set('country', query.country);
  if (query.domains) url.searchParams.set('domain', query.domains);
  if (query.excludeDomains) url.searchParams.set('excludedomain', query.excludeDomains);
  return url;
}

export interface NewsApiFetchResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  articles: NewsArticle[];
  totalResults: number | null;
  apiStatus: string | null;
  apiCode: string | null;
  apiMessage: string | null;
}

export async function fetchNewsApiArticles(
  apiKey: string,
  symbol: string,
  options?: Partial<NewsApiQueryOptions>,
  timeoutMs = 8000,
): Promise<NewsApiFetchResult> {
  const started = Date.now();
  const url = buildNewsApiRequestUrl(apiKey, symbol, options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'APEX-Trading-Engine/1.0',
        'X-Api-Key': apiKey,
      },
    });
    const latencyMs = Date.now() - started;
    let json: any = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

    if (json?.status === 'error') {
      return {
        ok: false,
        status: response.status,
        latencyMs,
        articles: [],
        totalResults: null,
        apiStatus: 'error',
        apiCode: json.code ?? null,
        apiMessage: json.message ?? null,
      };
    }

    const pageSize = normalizeNewsApiQuery(options).pageSize ?? 10;
    const articles: NewsArticle[] = (json?.articles || [])
      .slice(0, pageSize)
      .map((article: any) => ({
        title: article.title || '',
        description: article.description,
        url: article.url || '',
        source: article.source?.name || 'NewsAPI',
        publishedAt: article.publishedAt || new Date().toISOString(),
      }));

    return {
      ok: response.ok && json?.status === 'ok',
      status: response.status,
      latencyMs,
      articles,
      totalResults: typeof json?.totalResults === 'number' ? json.totalResults : null,
      apiStatus: json?.status ?? null,
      apiCode: null,
      apiMessage: null,
    };
  } finally {
    clearTimeout(timer);
  }
}
