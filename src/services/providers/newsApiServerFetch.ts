/**
 * Server-side Newsdata.io fetch — uses smartFetchJson (direct + PROXY_POOL_URLS).
 * NODE ONLY. Keeps newsApiRequest.ts free of undici/proxy imports.
 */

import { smartFetchJson, getProxyPoolInfo } from '../proxyFetch';
import {
  buildNewsDataIoRequestUrl,
  filterCryptoRelevantArticles,
  isCryptoHeadline,
  isNewsroomArticle,
  normalizeNewsApiQuery,
  relevanceTermsForSymbol,
  tagArticleSentiment,
  type NewsApiFetchResult,
  type NewsApiQueryOptions,
} from './newsApiRequest';
import type { NewsArticle } from './supplementalTypes';

export function formatNewsApiTransportError(error?: string | null): string {
  const msg = String(error || '');
  if (/abort|timeout|UND_ERR_CONNECT_TIMEOUT|fetch failed|ECONNRESET|ENETUNREACH|ETIMEDOUT/i.test(msg)) {
    const pool = getProxyPoolInfo();
    if (pool.poolSize === 0) {
      return 'newsdata.io unreachable on direct network. Set SOCKS5_PROXY=127.0.0.1:10808 and PROXY_MODE=proxy_first in .env, then restart the server.';
    }
    return `newsdata.io unreachable via proxy (${pool.healthy}/${pool.poolSize} healthy). Check that SOCKS5 on port 10808 is running.`;
  }
  return msg || 'request failed';
}

/**
 * Probe-friendly minimal query — faster than full symbol OR expansion.
 * `cryptoOnly` stays off here: a key probe must report transport/auth health,
 * never editorial relevance.
 */
export const NEWSAPI_PROBE_QUERY: Partial<NewsApiQueryOptions> = {
  endpoint: 'everything',
  sortBy: 'publishedAt',
  language: 'en',
  pageSize: 1,
  lookbackDays: 3,
  includeCryptoTerms: false,
  cryptoOnly: false,
};

export function mapNewsDataIoArticle(article: any): NewsArticle {
  return {
    title: article?.title || '',
    description: article?.description,
    url: article?.link || '',
    source: article?.source_id || 'Newsdata.io',
    publishedAt: article?.pubDate || new Date().toISOString(),
  };
}

export async function fetchNewsApiArticlesSmart(
  apiKey: string,
  symbol: string,
  options?: Partial<NewsApiQueryOptions>,
  timeoutMs = 20_000,
): Promise<NewsApiFetchResult> {
  const started = Date.now();
  const url = buildNewsDataIoRequestUrl(apiKey, symbol, options);
  const result = await smartFetchJson(url.toString(), {
    headers: { Accept: 'application/json' },
    timeoutMs,
    logKey: 'newsdata:articles',
  });
  const latencyMs = Date.now() - started;

  if (!result.ok) {
    const transport = result.status === 0;
    return {
      ok: false,
      status: result.status,
      latencyMs,
      articles: [],
      totalResults: null,
      apiStatus: transport ? 'error' : null,
      apiCode: transport ? 'networkError' : `HTTP_${result.status}`,
      apiMessage: transport ? formatNewsApiTransportError(result.error) : result.error || `HTTP ${result.status}`,
    };
  }

  const json = result.json;
  if (json?.status === 'error') {
    const apiError = json?.results && !Array.isArray(json.results) ? json.results : json;
    return {
      ok: false,
      status: result.status,
      latencyMs,
      articles: [],
      totalResults: null,
      apiStatus: 'error',
      apiCode: apiError?.code ?? null,
      apiMessage: apiError?.message ?? null,
    };
  }

  const pageSize = normalizeNewsApiQuery(options).pageSize ?? 10;
  const articles: NewsArticle[] = (json?.results || [])
    .slice(0, pageSize)
    .map(mapNewsDataIoArticle);

  return {
    ok: result.status >= 200 && result.status < 300 && json?.status === 'success',
    status: result.status,
    latencyMs,
    articles,
    totalResults: typeof json?.totalResults === 'number' ? json.totalResults : null,
    apiStatus: json?.status ?? null,
    apiCode: null,
    apiMessage: null,
  };
}

/** Widen the request so the crypto filter still has enough left to fill a page. */
const OVER_FETCH_FACTOR = 3;

export interface CryptoNewsFetchResult extends NewsApiFetchResult {
  /** Headlines NewsAPI returned that carried no cryptocurrency term. */
  filteredOut: number;
  /** How many the API returned before filtering. */
  returned: number;
}

const normalizeTitle = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Syndicated copies share a headline under different URLs, so match on both.
 * Aggregators also republish truncated headlines ("Is Enough to Retire?" for
 * "How Much XRP Is Enough to Retire?"), so a title fully contained in one
 * already kept is treated as the same story.
 */
function dedupeArticles(articles: NewsArticle[]): NewsArticle[] {
  const seenUrls = new Set<string>();
  const seenTitles: string[] = [];
  const out: NewsArticle[] = [];
  for (const article of articles) {
    const url = article.url?.trim().toLowerCase() ?? '';
    const title = normalizeTitle(article.title ?? '');
    if (!url && !title) continue;
    if (url && seenUrls.has(url)) continue;
    if (title && seenTitles.some((seen) => seen === title || seen.includes(title) || title.includes(seen))) {
      continue;
    }
    if (url) seenUrls.add(url);
    if (title) seenTitles.push(title);
    out.push(article);
  }
  return out;
}

/**
 * The feed-facing NewsAPI read.
 *
 * Two things NewsAPI cannot do for us:
 *   1. It matches `q` against the whole article body, so a bare `crypto`
 *      keyword pulls in everything a crypto outlet publishes — oil prices,
 *      satellite spectrum auctions, syndication footers. Hence the post-filter.
 *   2. OR-ing generic crypto terms into the query drowns out the symbol, which
 *      made every ticker show an identical feed. So the symbol query runs
 *      first and general crypto news only tops up a thin page.
 */
export async function fetchCryptoNewsArticles(
  apiKey: string,
  symbol: string,
  options?: Partial<NewsApiQueryOptions>,
  timeoutMs = 20_000,
): Promise<CryptoNewsFetchResult> {
  const query = normalizeNewsApiQuery(options);
  const pageSize = query.pageSize ?? 10;
  const cryptoOnly = query.cryptoOnly !== false;
  const requestPageSize = cryptoOnly
    ? Math.min(100, Math.max(pageSize, pageSize * OVER_FETCH_FACTOR))
    : pageSize;
  const symbolTerms = relevanceTermsForSymbol(symbol);

  const refine = (articles: NewsArticle[]): NewsArticle[] => {
    const unique = dedupeArticles(articles);
    if (!cryptoOnly) return unique;
    const relevant = filterCryptoRelevantArticles(unique.filter(isNewsroomArticle), symbolTerms);
    // Headline-level matches lead; snippet-only matches (macro pieces with a
    // crypto angle) keep their published order behind them.
    const strong = relevant.filter((a) => isCryptoHeadline(a, symbolTerms));
    const weak = relevant.filter((a) => !isCryptoHeadline(a, symbolTerms));
    return [...strong, ...weak];
  };

  // Stage 1 — this symbol only.
  const primary = await fetchNewsApiArticlesSmart(
    apiKey,
    symbol,
    { ...query, includeCryptoTerms: false, pageSize: requestPageSize },
    timeoutMs,
  );

  let returned = primary.articles.length;
  let collected = refine(primary.articles);

  // Stage 2 — broaden to the wider crypto tape only when stage 1 is thin.
  const wantsTopUp = query.includeCryptoTerms !== false && collected.length < pageSize;
  if (primary.ok && wantsTopUp) {
    const broadened = await fetchNewsApiArticlesSmart(
      apiKey,
      symbol,
      { ...query, includeCryptoTerms: true, pageSize: requestPageSize },
      timeoutMs,
    );
    if (broadened.ok) {
      returned += broadened.articles.length;
      collected = refine([...collected, ...broadened.articles]);
    }
  }

  const tagged = collected.map((article) => ({
    ...article,
    sentiment: tagArticleSentiment(article),
  }));

  return {
    ...primary,
    articles: tagged.slice(0, pageSize),
    returned,
    filteredOut: Math.max(0, returned - collected.length),
  };
}
