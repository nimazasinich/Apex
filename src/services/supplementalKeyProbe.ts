/* Copied from apex-trading-engine/src/services/supplementalKeyProbe.ts */

import {
  normalizeNewsApiQuery,
  type NewsApiQueryOptions,
} from './providers/newsApiRequest';
import {
  fetchNewsApiArticlesSmart,
  formatNewsApiTransportError,
  NEWSAPI_PROBE_QUERY,
} from './providers/newsApiServerFetch';
import { fetchCoinMarketCapQuotes } from './providers/coinMarketCapApiRequest';
export type SupplementalProbeKey =
  | 'newsApiKey'
  | 'coinMarketCapKey'
  | 'huggingFaceToken'
  | 'etherscanKey'
  | 'tronScanKey'
  | 'bscScanKey';

export interface SupplementalProbeResult {
  key: SupplementalProbeKey;
  ok: boolean;
  latencyMs: number;
  status: string;
  detail?: string;
}

const PROBE_TIMEOUT_MS = 15_000;

async function fetchJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<{ okHttp: boolean; status: number; json: any; text: string; latencyMs: number }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
    return { okHttp: res.ok, status: res.status, json, text, latencyMs: Date.now() - started };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const message = err instanceof Error ? err.message : 'request failed';
    throw Object.assign(new Error(message), { latencyMs });
  } finally {
    clearTimeout(timer);
  }
}

function fail(key: SupplementalProbeKey, latencyMs: number, status: string, detail?: string): SupplementalProbeResult {
  return { key, ok: false, latencyMs, status, detail };
}

function pass(key: SupplementalProbeKey, latencyMs: number, status = 'OK', detail?: string): SupplementalProbeResult {
  return { key, ok: true, latencyMs, status, detail };
}

async function probeNewsApi(apiKey: string, newsApiQuery?: NewsApiQueryOptions): Promise<SupplementalProbeResult> {
  if (!apiKey.trim()) return fail('newsApiKey', 0, 'EMPTY');
  const query = normalizeNewsApiQuery(newsApiQuery);
  const probeQuery = { ...query, ...NEWSAPI_PROBE_QUERY, pageSize: 1 };
  const result = await fetchNewsApiArticlesSmart(apiKey, 'bitcoin', probeQuery, PROBE_TIMEOUT_MS);
  if (result.apiCode === 'apiKeyInvalid' || result.apiCode === 'apiKeyMissing' || result.status === 401) {
    return fail('newsApiKey', result.latencyMs, 'UNAUTHORIZED', result.apiMessage || 'invalid key');
  }
  if (result.apiCode === 'networkError') {
    return fail('newsApiKey', result.latencyMs, 'UNREACHABLE', result.apiMessage || formatNewsApiTransportError());
  }
  if (result.ok) {
    const endpoint = query.endpoint === 'top-headlines' ? 'top-headlines' : 'everything';
    return pass('newsApiKey', result.latencyMs, 'OK', `${endpoint} · ${result.totalResults ?? result.articles.length} hits`);
  }
  return fail('newsApiKey', result.latencyMs, result.apiCode || `HTTP_${result.status}`, result.apiMessage || 'request failed');
}

async function probeCoinMarketCap(apiKey: string): Promise<SupplementalProbeResult> {
  if (!apiKey.trim()) return fail('coinMarketCapKey', 0, 'EMPTY');
  const result = await fetchCoinMarketCapQuotes(apiKey, ['BTC'], PROBE_TIMEOUT_MS);
  const message = String(result.apiMessage || result.text || 'request failed');
  if (result.status === 401 || result.status === 403 || /api\s*key|authorization|unauthori[sz]ed|invalid/i.test(message)) {
    return fail('coinMarketCapKey', result.latencyMs, 'UNAUTHORIZED', message.slice(0, 160));
  }
  const price = result.quotes.BTC?.usdPrice;
  if (result.ok && Number.isFinite(price)) {
    return pass('coinMarketCapKey', result.latencyMs, 'OK', `BTC $${Number(price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
  }
  return fail('coinMarketCapKey', result.latencyMs, result.apiCode || (result.status ? `HTTP_${result.status}` : 'UNREACHABLE'), message.slice(0, 160));
}

async function probeHuggingFace(token: string): Promise<SupplementalProbeResult> {
  if (!token.trim()) return fail('huggingFaceToken', 0, 'EMPTY');
  try {
    const r = await fetchJson('https://huggingface.co/api/whoami-v2', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 401 || r.status === 403) {
      return fail('huggingFaceToken', r.latencyMs, 'UNAUTHORIZED', 'invalid token');
    }
    if (r.okHttp && (r.json?.name || r.json?.type)) {
      return pass('huggingFaceToken', r.latencyMs, 'OK', r.json.name || r.json.type);
    }
    return fail('huggingFaceToken', r.latencyMs, `HTTP_${r.status}`, r.text.slice(0, 120));
  } catch (e: any) {
    return fail('huggingFaceToken', 0, 'ERROR', e?.message || 'request failed');
  }
}

function etherscanKeyRejected(json: any, text: string): boolean {
  const msg = String(json?.message || text || '');
  return /invalid\s*api\s*key|missing\/invalid api key|not ok/i.test(msg) && json?.status === '0';
}

async function probeEtherscanFamily(
  keyName: 'etherscanKey' | 'bscScanKey',
  apiKey: string,
  chainId: number,
): Promise<SupplementalProbeResult> {
  if (!apiKey.trim()) return fail(keyName, 0, 'EMPTY');

  try {
    const isBsc = keyName === 'bscScanKey' || chainId === 56;
    const url = new URL(isBsc ? 'https://api.bscscan.com/api' : 'https://api.etherscan.io/v2/api');
    if (!isBsc) {
      url.searchParams.set('chainid', String(chainId));
    }
    url.searchParams.set('module', 'stats');
    url.searchParams.set('action', isBsc ? 'bnbprice' : 'ethprice');
    url.searchParams.set('apikey', apiKey.trim());
    const r = await fetchJson(url.toString());

    if (etherscanKeyRejected(r.json, r.text)) {
      return fail(keyName, r.latencyMs, 'UNAUTHORIZED', r.json?.result || r.json?.message || 'invalid key');
    }
    const result = r.json?.result;
    const price = isBsc ? (result?.bnbusd || result?.ethusd) : (result?.ethusd || result?.ethbtc);
    if (String(r.json?.status) === '1' && price != null && price !== '') {
      return pass(
        keyName,
        r.latencyMs,
        'OK',
        isBsc ? `BNB $${price}` : `ETH $${price}`,
      );
    }
    if (/invalid api key/i.test(String(r.json?.result || r.json?.message || ''))) {
      return fail(keyName, r.latencyMs, 'UNAUTHORIZED', String(r.json?.result || r.json?.message));
    }
    return fail(keyName, r.latencyMs, r.json?.message || `HTTP_${r.status}`, String(r.json?.result || r.text || '').slice(0, 160));
  } catch (e: any) {
    return fail(keyName, e?.latencyMs || 0, 'ERROR', e?.message || 'request failed');
  }
}

async function probeTronScan(apiKey: string): Promise<SupplementalProbeResult> {
  if (!apiKey.trim()) return fail('tronScanKey', 0, 'EMPTY');
  try {
    const r = await fetchJson('https://apilist.tronscanapi.com/api/block?limit=1', {
      headers: { 'TRON-PRO-API-KEY': apiKey.trim() },
    });
    if (r.status === 401 || r.status === 403) {
      return fail('tronScanKey', r.latencyMs, 'UNAUTHORIZED', 'invalid key');
    }
    const rawErr = r.json?.Error || r.json?.error || r.json?.message;
    if (rawErr && /invalid|unauthorized|key/i.test(String(rawErr))) {
      return fail('tronScanKey', r.latencyMs, 'UNAUTHORIZED', String(rawErr).slice(0, 120));
    }
    if (r.okHttp && r.json && (Array.isArray(r.json?.data) || r.json?.number != null || Array.isArray(r.json?.blocks))) {
      return pass('tronScanKey', r.latencyMs, 'OK', 'block height ok');
    }
    return fail('tronScanKey', r.latencyMs, `HTTP_${r.status}`, (String(rawErr || r.text || '')).slice(0, 120));
  } catch (e: any) {
    return fail('tronScanKey', e?.latencyMs || 0, 'ERROR', e?.message || 'request failed');
  }
}

export async function probeSupplementalKey(
  key: SupplementalProbeKey,
  secret: string,
  opts?: { newsApiQuery?: NewsApiQueryOptions },
): Promise<SupplementalProbeResult> {
  switch (key) {
    case 'newsApiKey':
      return probeNewsApi(secret, opts?.newsApiQuery);
    case 'coinMarketCapKey':
      return probeCoinMarketCap(secret);
    case 'huggingFaceToken':
      return probeHuggingFace(secret);
    case 'etherscanKey':
      return probeEtherscanFamily('etherscanKey', secret, 1);
    case 'bscScanKey':
      return probeEtherscanFamily('bscScanKey', secret, 56);
    case 'tronScanKey':
      return probeTronScan(secret);
    default:
      return fail(key, 0, 'UNKNOWN_KEY');
  }
}

export async function probeAllSupplementalKeys(
  store: Record<SupplementalProbeKey, string>,
  opts?: { newsApiQuery?: NewsApiQueryOptions },
): Promise<Record<SupplementalProbeKey, SupplementalProbeResult>> {
  const keys = Object.keys(store) as SupplementalProbeKey[];
  const results = await Promise.all(keys.map((k) => probeSupplementalKey(k, store[k] || '', opts)));
  const out = {} as Record<SupplementalProbeKey, SupplementalProbeResult>;
  for (const r of results) out[r.key] = r;
  return out;
}
