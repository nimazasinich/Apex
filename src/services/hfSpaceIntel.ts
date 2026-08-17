/**
 * Owner-managed Hugging Face fallback gateways (after Binance/KuCoin for market data):
 * - Space-2: Cryptocurrency Data Source & Intelligence Hub
 * - Space-4: Short Hunter Datasource Gateway
 *
 * Sub-sources on Space-2 are tracked independently (crypto_dt_source vs crypto_api_clean).
 */

export const HF_SPACE_2_ORIGIN =
  process.env.HF_SPACE_2_ORIGIN || 'https://really-amin-datasourceforcryptocurrency-2.hf.space';
export const HF_SPACE_4_ORIGIN =
  process.env.HF_SPACE_4_ORIGIN || 'https://really-amin-datasourceforcryptocurrency-4.hf.space';

import { isApprovedHfSpaceContract, type ApprovedHfSpace } from './hfSpaceContracts';

const TIMEOUT_MS = 14_000;

export type HfSubSourceHealth = 'ok' | 'degraded' | 'error' | 'unknown';

export interface HfSpaceIntelStatus {
  fetchedAt: string;
  space2: { reachable: boolean; detail?: string };
  space4: { reachable: boolean; detail?: string };
  cryptoDtSource: HfSubSourceHealth;
  cryptoApiClean: HfSubSourceHealth;
}

export interface HfNewsItem {
  title: string;
  url?: string;
  source?: string;
  publishedAt?: string;
}

export interface HfFearGreed {
  value: number;
  classification: string;
  source: string;
}

export interface HfWhaleSample {
  summary: string;
}

export interface HfOnChainRow {
  amount: number;
  asset?: string;
  amountUsd?: number;
  chain?: string;
  direction?: 'inbound' | 'outbound';
  transactionHash: string;
  timestamp?: string;
  blockNumber?: number;
}

/**
 * Reads a Space endpoint and reports the outcome instead of throwing. A sleeping
 * Space aborts at the timeout, and callers here fan out with Promise.all — one
 * rejection used to take down whole feed snapshots that had other data ready.
 */
async function hfGet(path: string, origin = HF_SPACE_2_ORIGIN): Promise<{ ok: boolean; json: any; text: string; status: number }> {
  const space: ApprovedHfSpace = origin === HF_SPACE_4_ORIGIN ? 'space4' : 'space2';
  if (!isApprovedHfSpaceContract(space, 'GET', path)) {
    return { ok: false, json: null, text: `${space}_contract_not_allowed`, status: 0 };
  }
  const url = `${origin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'APEX-Trading-Engine/1.0' },
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, json, text, status: res.status };
  } catch (e: any) {
    const aborted = e?.name === 'AbortError' || /abort/i.test(String(e?.message ?? ''));
    return {
      ok: false,
      json: null,
      text: aborted ? `No response within ${Math.round(TIMEOUT_MS / 1000)}s (Space may be asleep)` : String(e?.message ?? 'request failed'),
      status: 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

function mapStatus(raw: unknown): HfSubSourceHealth {
  const s = String(raw || '').toLowerCase();
  if (s === 'ok' || s === 'live' || s === 'healthy' || s === 'operational') return 'ok';
  if (s === 'degraded' || s === 'partial') return 'degraded';
  if (s === 'error' || s === 'down' || s === 'offline') return 'error';
  return 'unknown';
}

/** Query Space-2 /api/new-sources/status — independent sub-source health. */
export async function fetchHfSpaceIntelStatus(): Promise<HfSpaceIntelStatus> {
  const [statusR, space4Ping] = await Promise.all([
    hfGet('/api/new-sources/status', HF_SPACE_2_ORIGIN),
    hfGet('/api/health', HF_SPACE_4_ORIGIN),
  ]);

  let cryptoDtSource: HfSubSourceHealth = 'unknown';
  let cryptoApiClean: HfSubSourceHealth = 'unknown';

  if (statusR.ok && statusR.json?.sources) {
    const sources = statusR.json.sources;
    cryptoDtSource = mapStatus(sources?.crypto_dt_source?.status);
    cryptoApiClean = mapStatus(sources?.crypto_api_clean?.status);
  }

  return {
    fetchedAt: new Date().toISOString(),
    space2: {
      reachable: statusR.ok,
      detail: statusR.ok ? undefined : statusR.text.slice(0, 120),
    },
    space4: {
      reachable: space4Ping.ok,
      detail: space4Ping.ok ? undefined : space4Ping.text.slice(0, 120),
    },
    cryptoDtSource,
    cryptoApiClean,
  };
}

function parseNewsRows(json: any): HfNewsItem[] {
  const rows =
    (Array.isArray(json?.news) && json.news) ||
    (Array.isArray(json?.articles) && json.articles) ||
    (Array.isArray(json?.data?.news) && json.data.news) ||
    (Array.isArray(json?.data?.articles) && json.data.articles) ||
    (Array.isArray(json?.data) && json.data) ||
    [];
  return rows
    .map((n: any) => ({
      title: String(n.title || n.headline || n.summary || '').slice(0, 140),
      url: n.url || n.link || n.guid,
      source: n.source || n.provider || n.feed_name || 'HF',
      publishedAt: n.published_at || n.publishedAt || n.pubDate || n.date || n.timestamp,
    }))
    .filter((n: HfNewsItem) => n.title.length > 0)
    .slice(0, 5);
}

/** News: documented Space-2 route → Space-4 complement → Space-2 compatibility route. */
export async function fetchHfSpaceNews(status?: HfSpaceIntelStatus): Promise<{
  ok: boolean;
  source: string;
  headlines: HfNewsItem[];
  detail?: string;
}> {
  const st = status ?? (await fetchHfSpaceIntelStatus());
  const attempts: Array<{ source: string; path: string; origin: string; skip?: boolean }> = [
    {
      source: 'HF Space-2 · news',
      path: '/api/news/latest?limit=10',
      origin: HF_SPACE_2_ORIGIN,
    },
    {
      source: 'HF Space-4 · news',
      path: '/api/news/latest?limit=10',
      origin: HF_SPACE_4_ORIGIN,
    },
    {
      source: 'HF Space-2 · resources',
      path: '/api/resources/news/latest',
      origin: HF_SPACE_2_ORIGIN,
    },
  ];

  let lastDetail = 'No headlines';
  for (const attempt of attempts) {
    if (attempt.skip) continue;
    try {
      const r = await hfGet(attempt.path, attempt.origin);
      const headlines = parseNewsRows(r.json);
      if (headlines.length) {
        return { ok: true, source: attempt.source, headlines };
      }
      lastDetail = r.text.slice(0, 160) || lastDetail;
    } catch (e: any) {
      lastDetail = e?.message || lastDetail;
    }
  }
  return { ok: false, source: 'HF Spaces', headlines: [], detail: lastDetail };
}

function parseFearGreed(json: any, sourceLabel: string): HfFearGreed | null {
  const candidates = [
    Array.isArray(json?.data) ? json.data[0] : json?.data,
    json?.fear_greed_index,
    json?.fearGreedIndex,
    json?.fearGreed,
    json?.value != null ? json : null,
  ];

  for (const candidate of candidates) {
    if (candidate == null) continue;
    const row = typeof candidate === 'object' ? candidate : { value: candidate };
    const raw = row.value ?? row.score ?? row.index ?? row.fear_greed_index ?? row.fearGreedIndex;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100) continue;
    return {
      value,
      classification: String(
        row.value_classification ?? row.classification ?? row.label ?? row.sentiment ?? json?.sentiment ?? '',
      ),
      source: sourceLabel,
    };
  }
  return null;
}

/** Sentiment / Fear&Greed: documented Space-2 routes → Space-4 complement. */
export async function fetchHfSpaceFearGreed(status?: HfSpaceIntelStatus): Promise<{
  ok: boolean;
  source: string;
  value: number | null;
  classification: string | null;
  detail?: string;
}> {
  const st = status ?? (await fetchHfSpaceIntelStatus());
  const attempts: Array<{ source: string; path: string; origin: string; skip?: boolean }> = [
    {
      source: 'HF Space-2 · sentiment/global',
      path: '/api/sentiment/global',
      origin: HF_SPACE_2_ORIGIN,
    },
    {
      source: 'HF Space-2 · fear-greed',
      path: '/api/fear-greed?limit=1',
      origin: HF_SPACE_2_ORIGIN,
    },
    {
      source: 'HF Space-4 · sentiment/global',
      path: '/api/sentiment/global',
      origin: HF_SPACE_4_ORIGIN,
    },
  ];

  let lastDetail = 'Unavailable';
  for (const attempt of attempts) {
    if (attempt.skip) continue;
    try {
      const r = await hfGet(attempt.path, attempt.origin);
      const parsed = parseFearGreed(r.json, attempt.source);
      if (parsed) {
        return {
          ok: true,
          source: parsed.source,
          value: parsed.value,
          classification: parsed.classification,
        };
      }
      lastDetail = r.text.slice(0, 160) || lastDetail;
    } catch (e: any) {
      lastDetail = e?.message || lastDetail;
    }
  }
  return { ok: false, source: 'HF Spaces', value: null, classification: null, detail: lastDetail };
}

/**
 * Structured on-chain/whale fallback from the two approved APEX Hugging Face Spaces.
 * No values are synthesized: rows without a real amount and transaction identifier
 * are discarded, and USD value remains absent unless the Space supplied it.
 */
function parseHfOnChainRows(json: any): HfOnChainRow[] {
  const rows =
    (Array.isArray(json?.data) && json.data) ||
    (Array.isArray(json?.transactions) && json.transactions) ||
    (Array.isArray(json?.whales) && json.whales) ||
    (Array.isArray(json?.data?.transactions) && json.data.transactions) ||
    (Array.isArray(json?.data?.whales) && json.data.whales) ||
    (Array.isArray(json?.data?.large_transactions) && json.data.large_transactions) ||
    (Array.isArray(json?.large_transactions) && json.large_transactions) ||
    [];

  const out: HfOnChainRow[] = [];
  for (const row of rows) {
    const amount = Number(row?.amount ?? row?.token_amount ?? row?.value ?? row?.quantity);
    const transactionHash = String(
      row?.hash ?? row?.tx_hash ?? row?.transaction_hash ?? row?.transactionHash ?? row?.id ?? '',
    ).trim();
    if (!Number.isFinite(amount) || amount <= 0 || !transactionHash) continue;

    const amountUsdRaw = Number(row?.amount_usd ?? row?.amountUSD ?? row?.value_usd ?? row?.usd_value);
    const blockNumberRaw = Number(row?.block_number ?? row?.blockNumber ?? row?.block);
    const rawDirection = String(row?.direction || '').toLowerCase();
    out.push({
      amount,
      asset: String(row?.symbol ?? row?.coin ?? row?.asset ?? row?.token_symbol ?? '').trim().toUpperCase() || undefined,
      amountUsd: Number.isFinite(amountUsdRaw) && amountUsdRaw > 0 ? amountUsdRaw : undefined,
      chain: String(row?.chain ?? row?.blockchain ?? row?.network ?? '').trim().toLowerCase() || undefined,
      direction: rawDirection === 'inbound' || rawDirection === 'outbound' ? rawDirection : undefined,
      transactionHash,
      timestamp: String(row?.timestamp ?? row?.time ?? row?.created_at ?? row?.datetime ?? '').trim() || undefined,
      blockNumber: Number.isFinite(blockNumberRaw) && blockNumberRaw >= 0 ? blockNumberRaw : undefined,
    });
  }
  return out.slice(0, 20);
}

/** Whales/on-chain: Space-2 service → Space-4 local whale routes. */
export async function fetchHfSpaceOnChain(symbol?: string): Promise<{
  ok: boolean;
  source: string;
  rows: HfOnChainRow[];
  detail?: string;
}> {
  const normalized = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const attempts = [
    {
      source: 'HF Space-2 · whales',
      origin: HF_SPACE_2_ORIGIN,
      path: `/api/service/whales?limit=20${normalized ? `&symbol=${encodeURIComponent(normalized)}` : ''}`,
    },
    {
      source: 'HF Space-4 · crypto whales',
      origin: HF_SPACE_4_ORIGIN,
      path: `/api/crypto/whales/transactions?limit=20${normalized ? `&symbol=${encodeURIComponent(normalized)}` : ''}`,
    },
    {
      source: 'HF Space-4 · whales',
      origin: HF_SPACE_4_ORIGIN,
      path: `/api/whales/transactions?limit=20${normalized ? `&symbol=${encodeURIComponent(normalized)}` : ''}`,
    },
  ];

  let lastDetail = 'No on-chain rows';
  for (const attempt of attempts) {
    const r = await hfGet(attempt.path, attempt.origin);
    const rows = parseHfOnChainRows(r.json);
    if (r.ok && rows.length) return { ok: true, source: attempt.source, rows };
    lastDetail = r.text.slice(0, 160) || lastDetail;
  }
  return { ok: false, source: 'HF Spaces', rows: [], detail: lastDetail };
}

/** Whales summary wrapper retained for existing UI consumers. */
export async function fetchHfSpaceWhales(symbol?: string): Promise<{
  ok: boolean;
  source: string;
  count: number;
  sample: HfWhaleSample[];
  detail?: string;
}> {
  const result = await fetchHfSpaceOnChain(symbol);
  if (!result.ok) {
    return { ok: false, source: result.source, count: 0, sample: [], detail: result.detail };
  }
  return {
    ok: true,
    source: result.source,
    count: result.rows.length,
    sample: result.rows.slice(0, 4).map((row) => ({
      summary: `${row.amountUsd ? `$${row.amountUsd.toLocaleString()} · ` : ''}${row.amount} ${row.asset || ''} · ${row.chain || 'chain'} · ${row.transactionHash.slice(0, 12)}…`.trim().slice(0, 120),
    })),
  };
}

function readPositivePrice(json: any): number | null {
  const candidates = [
    json?.price,
    json?.data?.price,
    json?.data?.ticker?.lastPrice,
    json?.data?.lastPrice,
    json?.lastPrice,
    json?.current_price,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

async function fetchSpace2Rate(base: 'BTC' | 'ETH'): Promise<number | null> {
  const r = await hfGet(`/api/service/rate?pair=${base}%2FUSDT`, HF_SPACE_2_ORIGIN);
  return r.ok ? readPositivePrice(r.json) : null;
}

/**
 * Market fallback from the approved Hugging Face Spaces only.
 * Exchange public APIs are tried by the caller before this function.
 */
export async function fetchHfSpaceMarketPrices(): Promise<{
  ok: boolean;
  source: string;
  btcUsd: number | null;
  ethUsd: number | null;
  detail?: string;
}> {
  // Space-4 Short Hunter is preferred for live Futures-aware market context.
  const [s4btc, s4eth] = await Promise.all([
    hfGet('/api/short-hunter/market/BTC', HF_SPACE_4_ORIGIN),
    hfGet('/api/short-hunter/market/ETH', HF_SPACE_4_ORIGIN),
  ]);
  const s4BtcPrice = s4btc.ok ? readPositivePrice(s4btc.json) : null;
  const s4EthPrice = s4eth.ok ? readPositivePrice(s4eth.json) : null;
  if (s4BtcPrice != null || s4EthPrice != null) {
    return { ok: true, source: 'HF Space-4 · Short Hunter', btcUsd: s4BtcPrice, ethUsd: s4EthPrice };
  }

  // Space-2's service/rate contract is provider-agnostic from APEX's perspective.
  const [s2BtcPrice, s2EthPrice] = await Promise.all([fetchSpace2Rate('BTC'), fetchSpace2Rate('ETH')]);
  if (s2BtcPrice != null || s2EthPrice != null) {
    return { ok: true, source: 'HF Space-2 · rate service', btcUsd: s2BtcPrice, ethUsd: s2EthPrice };
  }

  // Final owner-managed market fallback: Space-2's REAL-DATA-ONLY market
  // cache. APEX never calls an underlying third-party aggregator directly.
  const s2Market = await hfGet('/api/market?symbols=BTC,ETH&limit=2', HF_SPACE_2_ORIGIN);
  const rows = s2Market.ok && s2Market.json?.success === true && Array.isArray(s2Market.json?.data)
    ? s2Market.json.data
    : [];
  const priceFor = (base: string): number | null => {
    const row = rows.find((item: any) => String(item?.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/USDT$/, '') === base);
    return row ? readPositivePrice(row) : null;
  };
  const marketBtc = priceFor('BTC');
  const marketEth = priceFor('ETH');
  if (marketBtc != null || marketEth != null) {
    return { ok: true, source: 'HF Space-2 · market cache', btcUsd: marketBtc, ethUsd: marketEth };
  }

  return {
    ok: false,
    source: 'HF Spaces',
    btcUsd: null,
    ethUsd: null,
    detail: [s4btc.text, s4eth.text, s2Market.text].filter(Boolean).map((v) => String(v).slice(0, 80)).join(' · ') || 'No market price',
  };
}
