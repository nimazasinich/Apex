/**
 * Live intelligence feeds for Settings preview. Owner-approved routing:
 * Market: Binance public → KuCoin public → approved HF Spaces → user CMC key.
 * News / sentiment / whales: approved HF Spaces first; direct external APIs
 * and user-entered keys are final fallbacks. No additional direct market aggregator is inserted.
 */

import {
  fetchHfSpaceFearGreed,
  fetchHfSpaceIntelStatus,
  fetchHfSpaceNews,
  fetchHfSpaceMarketPrices,
  fetchHfSpaceWhales,
} from './hfSpaceIntel';
import {
  fetchCryptoNewsArticles,
  formatNewsApiTransportError,
} from './providers/newsApiServerFetch';
import {
  normalizeNewsApiQuery,
  type NewsApiQueryOptions,
} from './providers/newsApiRequest';
import { fetchCoinMarketCapQuotes } from './providers/coinMarketCapApiRequest';
import { binanceTicker, kucoinTicker } from './providers/publicExchangeClient';

export type FeedStatus = 'ok' | 'degraded' | 'error' | 'blocked' | 'not_configured';

export interface IntelligenceFeedSnapshot {
  fetchedAt: string;
  fearGreed: {
    ok: boolean;
    status: FeedStatus;
    value: number | null;
    classification: string | null;
    detail?: string;
  };
  market: {
    ok: boolean;
    status: FeedStatus;
    source: string;
    btcUsd: number | null;
    ethUsd: number | null;
    detail?: string;
  };
  ethOracle: {
    ok: boolean;
    status: FeedStatus;
    ethUsd: number | null;
    detail?: string;
  };
  news: {
    ok: boolean;
    status: FeedStatus;
    source: string;
    headlines: Array<{ title: string; url?: string; source?: string }>;
    detail?: string;
  };
  whales: {
    ok: boolean;
    status: FeedStatus;
    source: string;
    count: number;
    sample: Array<{ summary: string }>;
    detail?: string;
  };
}

const TIMEOUT_MS = 12_000;

async function getJson(url: string, init: RequestInit = {}): Promise<{ status: number; json: any; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'APEX-Trading-Engine/1.0',
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

function blockedDetail(text: string): string {
  if (/cloudflare|just a moment|attention required|enable cookies/i.test(text)) {
    return 'Upstream blocked (Cloudflare / bot protection)';
  }
  return text.slice(0, 160) || 'request failed';
}

export async function fetchIntelligenceFeedSnapshot(opts?: {
  etherscanKey?: string;
  etherscanKeys?: string[];
  coinMarketCapKey?: string;
  coinMarketCapKeys?: string[];
  newsApiKey?: string;
  newsApiKeys?: string[];
  newsApiQuery?: NewsApiQueryOptions;
}): Promise<IntelligenceFeedSnapshot> {
  const unique = (values: Array<string | undefined>): string[] => [...new Set(values.map((value) => value?.trim() || '').filter(Boolean))];
  const etherscanKeys = unique([...(opts?.etherscanKeys || []), opts?.etherscanKey]);
  const coinMarketCapKeys = unique([...(opts?.coinMarketCapKeys || []), opts?.coinMarketCapKey]);
  const newsApiKeys = unique([...(opts?.newsApiKeys || []), opts?.newsApiKey]);
  const newsApiQuery = opts?.newsApiQuery;
  const hfStatusP = fetchHfSpaceIntelStatus();

  const fearGreedP = (async () => {
    const hfStatus = await hfStatusP;
    const hf = await fetchHfSpaceFearGreed(hfStatus);
    if (hf.ok && hf.value != null) {
      return {
        ok: true,
        status: 'ok' as const,
        value: hf.value,
        classification: hf.classification,
        detail: `Source: ${hf.source}`,
      };
    }
    try {
      const direct = await getJson('https://api.alternative.me/fng/?limit=1');
      const row = direct.json?.data?.[0];
      const value = Number(row?.value);
      if (direct.status >= 200 && direct.status < 300 && Number.isFinite(value)) {
        return {
          ok: true,
          status: 'degraded' as const,
          value,
          classification: typeof row?.value_classification === 'string' ? row.value_classification : null,
          detail: 'Approved HF sentiment unavailable; using Alternative.me public fallback',
        };
      }
    } catch { /* continue to explicit unavailable state */ }
    return {
      ok: false,
      status: 'error' as const,
      value: null,
      classification: null,
      detail: hf.detail || 'HF Spaces and Alternative.me are unavailable',
    };
  })();

  const marketP = (async (): Promise<IntelligenceFeedSnapshot['market']> => {
    const readPrice = (result: Awaited<ReturnType<typeof binanceTicker>>): number | null => {
      if (!result.ok) return null;
      const value = Number((result.data as any)?.price ?? (result.data as any)?.lastPrice);
      return Number.isFinite(value) && value > 0 ? value : null;
    };

    // Tier 1 — Binance public USD-M Futures. No user credential is involved.
    const [binanceBtc, binanceEth] = await Promise.all([
      binanceTicker('BTCUSDT'),
      binanceTicker('ETHUSDT'),
    ]);
    const binanceBtcUsd = readPrice(binanceBtc);
    const binanceEthUsd = readPrice(binanceEth);
    if (binanceBtcUsd != null || binanceEthUsd != null) {
      return {
        ok: true,
        status: 'ok',
        source: 'Binance Futures · public',
        btcUsd: binanceBtcUsd,
        ethUsd: binanceEthUsd,
      };
    }

    // Tier 2 — KuCoin public Futures.
    const [kucoinBtc, kucoinEth] = await Promise.all([
      kucoinTicker('BTC-USDT'),
      kucoinTicker('ETH-USDT'),
    ]);
    const kucoinBtcUsd = readPrice(kucoinBtc);
    const kucoinEthUsd = readPrice(kucoinEth);
    if (kucoinBtcUsd != null || kucoinEthUsd != null) {
      return {
        ok: true,
        status: 'ok',
        source: 'KuCoin Futures · public',
        btcUsd: kucoinBtcUsd,
        ethUsd: kucoinEthUsd,
      };
    }

    // Tier 3 — the two owner-approved Hugging Face Spaces.
    const hf = await fetchHfSpaceMarketPrices();
    if (hf.ok && (hf.btcUsd != null || hf.ethUsd != null)) {
      return {
        ok: true,
        status: 'degraded',
        source: hf.source,
        btcUsd: hf.btcUsd,
        ethUsd: hf.ethUsd,
        detail: 'Exchange public feeds unavailable; served by approved Hugging Face fallback',
      };
    }

    // Tier 4 — attached CoinMarketCap key rotation. Each key gets an independent
    // attempt, so a revoked/rate-limited primary cannot suppress a healthy reserve.
    let lastCmcDetail = '';
    for (let index = 0; index < coinMarketCapKeys.length; index += 1) {
      const cmc = await fetchCoinMarketCapQuotes(coinMarketCapKeys[index], ['BTC', 'ETH'], TIMEOUT_MS);
      const btc = cmc.quotes.BTC?.usdPrice ?? null;
      const eth = cmc.quotes.ETH?.usdPrice ?? null;
      if (cmc.ok && (btc != null || eth != null)) {
        return {
          ok: true,
          status: 'degraded',
          source: index === 0 ? 'CoinMarketCap · default key' : `CoinMarketCap · reserve ${index + 1}`,
          btcUsd: btc,
          ethUsd: eth,
          detail: 'Public exchanges and approved Hugging Face Spaces were unavailable',
        };
      }
      lastCmcDetail = cmc.apiMessage || cmc.apiCode || `HTTP ${cmc.status}`;
    }

    return {
      ok: false,
      status: coinMarketCapKeys.length ? 'error' : 'not_configured',
      source: 'market provider chain',
      btcUsd: null,
      ethUsd: null,
      detail: lastCmcDetail || hf.detail || 'Binance, KuCoin, HF Spaces and CoinMarketCap key rotation are unavailable',
    };
  })();

  const ethOracleP = (async () => {
    if (!etherscanKeys.length) {
      return { ok: false, status: 'error' as const, ethUsd: null, detail: 'No Etherscan key' };
    }
    let detail = 'failed';
    for (const key of etherscanKeys) {
      try {
        const url = new URL('https://api.etherscan.io/v2/api');
        url.searchParams.set('chainid', '1');
        url.searchParams.set('module', 'stats');
        url.searchParams.set('action', 'ethprice');
        url.searchParams.set('apikey', key);
        const r = await getJson(url.toString());
        const ethUsd = Number(r.json?.result?.ethusd);
        if (String(r.json?.status) === '1' && Number.isFinite(ethUsd)) {
          return { ok: true, status: 'ok' as const, ethUsd };
        }
        detail = String(r.json?.result || r.json?.message || blockedDetail(r.text)).slice(0, 160);
      } catch (e: any) {
        detail = e?.message || 'failed';
      }
    }
    return { ok: false, status: 'error' as const, ethUsd: null, detail };
  })();

  /** News: approved HF Spaces first, operator-entered Newsdata.io key last. */
  const newsP = (async (): Promise<IntelligenceFeedSnapshot['news']> => {
    const hfNews = await fetchHfSpaceNews(await hfStatusP);
    if (hfNews.ok && hfNews.headlines.length) {
      return {
        ok: true,
        status: 'degraded',
        source: hfNews.source,
        headlines: hfNews.headlines,
        detail: 'Served by approved Hugging Face datasource fallback',
      };
    }

    const query = normalizeNewsApiQuery(newsApiQuery);
    const label = query.endpoint === 'top-headlines' ? 'Newsdata.io top-headlines' : 'Newsdata.io everything';
    if (!newsApiKeys.length) {
      return {
        ok: false,
        status: 'not_configured',
        source: 'Newsdata.io',
        headlines: [],
        detail: hfNews.detail || 'Both approved Hugging Face Spaces are unavailable and no Newsdata.io key is configured',
      };
    }

    let lastNewsDetail = '';
    for (let index = 0; index < newsApiKeys.length; index += 1) {
      try {
        const result = await fetchCryptoNewsArticles(newsApiKeys[index], 'BTCUSDT', {
          ...query,
          pageSize: Math.min(5, query.pageSize ?? 5),
        });
        if (result.ok && result.articles.length) {
          return {
            ok: true,
            status: 'degraded',
            source: index === 0 ? label : `${label} · reserve ${index + 1}`,
            headlines: result.articles.map((a) => ({ title: a.title.slice(0, 140), url: a.url, source: a.source })),
            detail: result.filteredOut > 0
              ? `${result.filteredOut} non-crypto headline${result.filteredOut === 1 ? '' : 's'} filtered out`
              : 'Approved Hugging Face Spaces unavailable; using configured Newsdata.io fallback',
          };
        }
        lastNewsDetail = result.apiMessage || result.apiCode || `HTTP ${result.status}`;
      } catch (e: any) {
        lastNewsDetail = e?.message || 'Newsdata.io request failed';
      }
    }
    return {
      ok: false,
      status: 'error',
      source: 'Newsdata.io',
      headlines: [],
      detail: lastNewsDetail || hfNews.detail || formatNewsApiTransportError(),
    };
  })();

  const whalesP = (async (): Promise<IntelligenceFeedSnapshot['whales']> => {
    const hfWhales = await fetchHfSpaceWhales();
    if (hfWhales.ok && hfWhales.sample.length) {
      return {
        ok: true,
        status: 'ok',
        source: hfWhales.source,
        count: hfWhales.count,
        sample: hfWhales.sample,
        detail: hfWhales.detail,
      };
    }

    // Keyless attached fallback: ClankApp. It is used only for the Settings
    // preview here; symbol-specific explorer evidence remains in the orchestrator.
    try {
      const clank = await getJson('https://clankapp.com/api/whales/recent');
      const rows = Array.isArray(clank.json) ? clank.json : Array.isArray(clank.json?.data) ? clank.json.data : Array.isArray(clank.json?.whales) ? clank.json.whales : [];
      if (clank.status >= 200 && clank.status < 300 && rows.length) {
        return {
          ok: true,
          status: 'degraded',
          source: 'ClankApp · public',
          count: rows.length,
          sample: rows.slice(0, 5).map((row: any) => ({
            summary: [row?.amount, row?.symbol || row?.coin, row?.chain].filter(Boolean).join(' ') || 'whale transfer',
          })),
          detail: 'Approved HF whale feed unavailable; using ClankApp public fallback',
        };
      }
    } catch { /* explicit unavailable state below */ }
    return {
      ok: false,
      status: 'error',
      source: 'whale provider chain',
      count: 0,
      sample: [],
      detail: hfWhales.detail || 'HF Spaces and ClankApp returned no whale/on-chain rows',
    };
  })();

  // Each card degrades on its own. A single rejected feed must not blank the
  // other four — that is how a sleeping HF Space used to 500 the whole preview.
  const guard = async <T extends { status: FeedStatus; detail?: string }>(
    p: Promise<T>,
    fallback: Omit<T, 'status' | 'detail'>,
  ): Promise<T> => {
    try {
      return await p;
    } catch (e: any) {
      return { ...fallback, status: 'error', detail: e?.message || 'feed failed' } as T;
    }
  };

  const [fearGreed, market, ethOracle, news, whales] = await Promise.all([
    guard(fearGreedP, { ok: false, value: null, classification: null }),
    guard(marketP, { ok: false, source: 'market', btcUsd: null, ethUsd: null }),
    guard(ethOracleP, { ok: false, ethUsd: null }),
    guard(newsP, { ok: false, source: 'Newsdata.io', headlines: [] }),
    guard(whalesP, { ok: false, source: 'whales', count: 0, sample: [] }),
  ]);

  return {
    fetchedAt: new Date().toISOString(),
    fearGreed,
    market,
    ethOracle,
    news,
    whales,
  };
}
