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
import { smartFetchJson, describeUpstreamUnreachable } from './proxyFetch';

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
 * Explicit outcome of a single HF read, so a caller can never confuse
 * "the Space works and truthfully has nothing" with "the Space answered 200 but
 * in a shape APEX does not recognise" or "the Space was unreachable".
 *
 * Grounded in the verified transport contract of `smartFetchJson`: it reports
 * ok=true only for a 2xx whose body parsed as JSON; a non-2xx yields ok=false
 * with the real HTTP status; a transport/DNS/timeout failure yields ok=false
 * with status 0.
 */
export type HfResultState = 'SUCCESS' | 'NO_DATA' | 'SCHEMA_MISMATCH' | 'NETWORK_ERROR';

/**
 * Per-request diagnostics. Present so an operator can tell which endpoint
 * actually served a feed — and compare competing endpoints on observed runtime
 * data — without reproducing the calls by hand.
 */
export interface HfRequestDiagnostics {
  endpoint: string;
  provider: string;
  latencyMs: number;
  httpStatus: number;
  resultState: HfResultState;
  /** Rows/records APEX could actually use from this response. */
  itemCount: number;
  /** Raw records present in the recognised container before APEX validation. */
  rawItemCount: number;
  /** Top-level body keys — only recorded when the shape was not recognised. */
  receivedKeys?: string[];
  /** Present when the endpoint was skipped or the transport failed. */
  error?: string;
}

/** Ordered container paths, mirroring the shapes the Spaces are known to emit. */
const NEWS_CONTAINERS = ['news', 'articles', 'data.news', 'data.articles', 'data'] as const;
const ONCHAIN_CONTAINERS = [
  'data',
  'transactions',
  'whales',
  'data.transactions',
  'data.whales',
  'data.large_transactions',
  'large_transactions',
] as const;

function readPath(json: any, path: string): unknown {
  return path.split('.').reduce<any>((node, key) => (node == null ? undefined : node[key]), json);
}

/** Top-level keys of a JSON object body, for schema-mismatch diagnostics. */
export function collectTopLevelKeys(json: unknown): string[] {
  if (json == null || typeof json !== 'object') return [];
  return Object.keys(json as Record<string, unknown>).slice(0, 24);
}

/**
 * Locate the array container a Space used. A null container means the body did
 * not match any known shape — that is a schema change, not an absence of data.
 */
export function pickHfRows(
  json: any,
  containers: readonly string[],
): { container: string | null; rows: any[] } {
  for (const path of containers) {
    const value = readPath(json, path);
    if (Array.isArray(value)) return { container: path, rows: value };
  }
  return { container: null, rows: [] };
}

/**
 * Single source of truth for the four states. Ordering matters: an unreachable
 * endpoint is never reported as empty, and a recognised-but-empty container is
 * never reported as a schema break.
 */
export function classifyHfPayload(input: {
  ok: boolean;
  container: string | null;
  rawCount: number;
  usableCount: number;
}): HfResultState {
  if (!input.ok) return 'NETWORK_ERROR';
  if (input.container === null) return 'SCHEMA_MISMATCH';
  if (input.rawCount === 0) return 'NO_DATA';
  // The endpoint returned records but none survived APEX validation: the schema
  // changed. Reporting this as NO_DATA would hide a real upstream break.
  if (input.usableCount === 0) return 'SCHEMA_MISMATCH';
  return 'SUCCESS';
}

/**
 * Human-readable telemetry table for operators and tests: which endpoints were
 * tried, what they returned, how long they took, and whether data was usable.
 */
export function formatHfDiagnosticsTable(attempts: HfRequestDiagnostics[]): string {
  const header = ['ENDPOINT', 'HTTP', 'LATENCY_MS', 'STATE', 'DATA'];
  const rows = attempts.map((a) => [
    a.endpoint,
    String(a.httpStatus),
    String(a.latencyMs),
    a.resultState,
    a.itemCount > 0 ? `YES(${a.itemCount})` : a.rawItemCount > 0 ? `RAW_ONLY(${a.rawItemCount})` : 'NONE',
  ]);
  const widths = header.map((_, column) =>
    Math.max(header[column].length, ...rows.map((row) => row[column].length)),
  );
  const line = (cells: string[]) => cells.map((cell, i) => cell.padEnd(widths[i])).join('  ').trimEnd();
  return [line(header), ...rows.map(line)].join('\n');
}

/**
 * Reads a Space endpoint through the shared proxy-aware transport — the same
 * routing, circuit-breaking, caching and geo-block (403/451) fall-through that
 * APEX already uses for Binance/KuCoin and for the rest of the HF surface via
 * hfSpacesClient. Previously this used a bare fetch() with none of that, so in
 * proxy-required or geo-blocked environments every intel/news/sentiment/whale/
 * market-fallback call failed silently while the proxied primary market tier in
 * the same snapshot still worked — the fallback was defeated exactly when needed.
 * smartFetchJson still attempts a direct route first, so environments that never
 * needed a proxy are unaffected. Reports the outcome instead of throwing; a
 * sleeping Space fails fast and each caller's Promise.all fan-out keeps whatever
 * other feeds already returned.
 */
async function hfGet(path: string, origin = HF_SPACE_2_ORIGIN): Promise<{ ok: boolean; json: any; text: string; status: number; latencyMs: number }> {
  const space: ApprovedHfSpace = origin === HF_SPACE_4_ORIGIN ? 'space4' : 'space2';
  const startedAt = Date.now();
  if (!isApprovedHfSpaceContract(space, 'GET', path)) {
    return { ok: false, json: null, text: `${space}_contract_not_allowed`, status: 0, latencyMs: 0 };
  }
  const url = `${origin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  const result = await smartFetchJson(url, {
    method: 'GET',
    timeoutMs: TIMEOUT_MS,
    logKey: `hf_${space}:GET:${path.split('?')[0]}`,
    priority: 'interactive',
  });
  const latencyMs = Date.now() - startedAt;
  if (result.ok) {
    const json = result.json ?? null;
    return {
      ok: true,
      json,
      // Callers only read `text` for diagnostics/empty-body detail; data is taken
      // from `json`. A compact JSON echo keeps that diagnostic value.
      text: json != null ? JSON.stringify(json).slice(0, 400) : '',
      status: result.status || 200,
      latencyMs,
    };
  }
  let host = origin;
  try {
    host = new URL(url).hostname;
  } catch {
    /* keep the origin string for the diagnostic */
  }
  return {
    ok: false,
    json: null,
    text: describeUpstreamUnreachable(host, result.error).slice(0, 200),
    status: result.status || 0,
    latencyMs,
  };
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

/**
 * Parses a news body and reports what was found, so the caller can separate an
 * endpoint that is genuinely empty from one whose schema no longer matches.
 * Row selection and field precedence are unchanged.
 */
export function parseHfNewsPayload(json: any): {
  container: string | null;
  rawCount: number;
  headlines: HfNewsItem[];
} {
  const { container, rows } = pickHfRows(json, NEWS_CONTAINERS);
  const headlines = rows
    .map((n: any) => ({
      title: String(n?.title || n?.headline || n?.summary || '').slice(0, 140),
      url: n?.url || n?.link || n?.guid,
      source: n?.source || n?.provider || n?.feed_name || 'HF',
      publishedAt: n?.published_at || n?.publishedAt || n?.pubDate || n?.date || n?.timestamp,
    }))
    .filter((n: HfNewsItem) => n.title.length > 0)
    .slice(0, 5);
  return { container, rawCount: rows.length, headlines };
}

/** Most actionable state across attempted endpoints. */
function aggregateState(attempts: HfRequestDiagnostics[]): HfResultState {
  if (attempts.some((a) => a.resultState === 'SCHEMA_MISMATCH')) return 'SCHEMA_MISMATCH';
  if (attempts.some((a) => a.resultState === 'NO_DATA')) return 'NO_DATA';
  return 'NETWORK_ERROR';
}

/**
 * News: documented Space-2 route → Space-4 complement → Space-2 compatibility route.
 *
 * The try-order is deliberately unchanged. The loop only accepts an attempt that
 * yielded usable headlines, so an endpoint answering 200 with an empty article
 * array can never win over a later endpoint that has real data — it falls
 * through and is recorded as NO_DATA. `attempts` carries the observed endpoint,
 * latency, item count and parser state so the relative quality of
 * /api/news/latest and /api/resources/news/latest can be compared from real
 * runtime data instead of being guessed at here.
 */
export async function fetchHfSpaceNews(status?: HfSpaceIntelStatus): Promise<{
  ok: boolean;
  source: string;
  headlines: HfNewsItem[];
  detail?: string;
  state: HfResultState;
  receivedKeys?: string[];
  attempts: HfRequestDiagnostics[];
}> {
  // When the caller (e.g. intelligenceFeedProbe) already fetched status, reuse it
  // to skip a Space known unreachable instead of re-fetching status here — the old
  // `const st = status ?? await fetchHfSpaceIntelStatus()` computed a value that was
  // never read, so one feed snapshot paid for the status probe ~3x over.
  const attempts: Array<{ source: string; path: string; origin: string; skip?: boolean }> = [
    {
      source: 'HF Space-2 · news',
      path: '/api/apex/news',
      origin: HF_SPACE_2_ORIGIN,
      skip: status ? !status.space2.reachable : false,
    },
    {
      source: 'HF Space-4 · news',
      path: '/api/apex/news',
      origin: HF_SPACE_4_ORIGIN,
      skip: status ? !status.space4.reachable : false,
    },
    {
      source: 'HF Space-2 · resources',
      path: '/api/apex/news',
      origin: HF_SPACE_2_ORIGIN,
      skip: status ? !status.space2.reachable : false,
    },
  ];

  const diagnostics: HfRequestDiagnostics[] = [];
  let lastDetail = 'No headlines';
  for (const attempt of attempts) {
    if (attempt.skip) {
      diagnostics.push({
        endpoint: attempt.path,
        provider: attempt.source,
        latencyMs: 0,
        httpStatus: 0,
        resultState: 'NETWORK_ERROR',
        itemCount: 0,
        rawItemCount: 0,
        error: 'skipped_space_unreachable',
      });
      continue;
    }
    try {
      const r = await hfGet(attempt.path, attempt.origin);
      const canonicalBody = r.json;
      if (canonicalBody?.success !== true && canonicalBody?.dataState) {
        diagnostics.push({
          endpoint: attempt.path,
          provider: attempt.source,
          latencyMs: r.latencyMs,
          httpStatus: r.status,
          resultState: 'SCHEMA_MISMATCH',
          itemCount: 0,
          rawItemCount: 0,
          receivedKeys: collectTopLevelKeys(canonicalBody),
          error: 'canonical_success_missing',
        });
        continue;
      }
      const parsed = parseHfNewsPayload(canonicalBody);
      const state = classifyHfPayload({
        ok: r.ok,
        container: parsed.container,
        rawCount: parsed.rawCount,
        usableCount: parsed.headlines.length,
      });
      const record: HfRequestDiagnostics = {
        endpoint: attempt.path,
        provider: attempt.source,
        latencyMs: r.latencyMs,
        httpStatus: r.status,
        resultState: state,
        itemCount: parsed.headlines.length,
        rawItemCount: parsed.rawCount,
      };
      if (state === 'SCHEMA_MISMATCH') record.receivedKeys = collectTopLevelKeys(r.json);
      if (!r.ok) record.error = r.text.slice(0, 160);
      diagnostics.push(record);

      if (state === 'SUCCESS') {
        return {
          ok: true,
          source: attempt.source,
          headlines: parsed.headlines,
          state,
          attempts: diagnostics,
        };
      }
      lastDetail = r.text.slice(0, 160) || lastDetail;
    } catch (e: any) {
      diagnostics.push({
        endpoint: attempt.path,
        provider: attempt.source,
        latencyMs: 0,
        httpStatus: 0,
        resultState: 'NETWORK_ERROR',
        itemCount: 0,
        rawItemCount: 0,
        error: String(e?.message || 'request_threw').slice(0, 160),
      });
      lastDetail = e?.message || lastDetail;
    }
  }
  const state = aggregateState(diagnostics);
  return {
    ok: false,
    source: 'HF Spaces',
    headlines: [],
    detail: lastDetail,
    state,
    receivedKeys: diagnostics.find((a) => a.resultState === 'SCHEMA_MISMATCH')?.receivedKeys,
    attempts: diagnostics,
  };
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

/**
 * Classifier for endpoints that carry a scalar (a price, an index value) rather
 * than a row container. An empty `data` array is the only honest NO_DATA case; a
 * 200 body with no usable value is a schema change, not an absence of data.
 */
export function classifyHfScalarPayload(ok: boolean, json: any, found: boolean): HfResultState {
  if (!ok) return 'NETWORK_ERROR';
  if (found) return 'SUCCESS';
  if (Array.isArray(json?.data) && json.data.length === 0) return 'NO_DATA';
  return 'SCHEMA_MISMATCH';
}

/**
 * Fear&Greed carries a scalar rather than a row container, so it gets its own
 * classifier. An empty `data` array is the only honest NO_DATA case; a body that
 * carries no recognisable value-bearing key is a schema change.
 */
export function classifyHfFearGreedPayload(ok: boolean, json: any, parsed: HfFearGreed | null): HfResultState {
  return classifyHfScalarPayload(ok, json, parsed !== null);
}

/**
 * Sentiment / Fear&Greed: documented Space-2 routes → Space-4 complement.
 * The fallback order is unchanged; only diagnostics were added.
 */
export async function fetchHfSpaceFearGreed(status?: HfSpaceIntelStatus): Promise<{
  ok: boolean;
  source: string;
  value: number | null;
  classification: string | null;
  detail?: string;
  state: HfResultState;
  receivedKeys?: string[];
  attempts: HfRequestDiagnostics[];
}> {
  // Same reuse as fetchHfSpaceNews: honor a caller-supplied status to skip an
  // unreachable Space; do not re-probe status here (the old value was discarded).
  const attempts: Array<{ source: string; path: string; origin: string; skip?: boolean }> = [
    {
      source: 'HF Space-2 · sentiment/global',
      path: '/api/sentiment/global',
      origin: HF_SPACE_2_ORIGIN,
      skip: status ? !status.space2.reachable : false,
    },
    {
      source: 'HF Space-2 · fear-greed',
      path: '/api/fear-greed?limit=1',
      origin: HF_SPACE_2_ORIGIN,
      skip: status ? !status.space2.reachable : false,
    },
    {
      source: 'HF Space-4 · sentiment/global',
      path: '/api/sentiment/global',
      origin: HF_SPACE_4_ORIGIN,
      skip: status ? !status.space4.reachable : false,
    },
  ];

  const diagnostics: HfRequestDiagnostics[] = [];
  let lastDetail = 'Unavailable';
  for (const attempt of attempts) {
    if (attempt.skip) {
      diagnostics.push({
        endpoint: attempt.path,
        provider: attempt.source,
        latencyMs: 0,
        httpStatus: 0,
        resultState: 'NETWORK_ERROR',
        itemCount: 0,
        rawItemCount: 0,
        error: 'skipped_space_unreachable',
      });
      continue;
    }
    try {
      const r = await hfGet(attempt.path, attempt.origin);
      const parsed = parseFearGreed(r.json, attempt.source);
      const state = classifyHfFearGreedPayload(r.ok, r.json, parsed);
      const record: HfRequestDiagnostics = {
        endpoint: attempt.path,
        provider: attempt.source,
        latencyMs: r.latencyMs,
        httpStatus: r.status,
        resultState: state,
        itemCount: parsed ? 1 : 0,
        rawItemCount: parsed ? 1 : 0,
      };
      if (state === 'SCHEMA_MISMATCH') record.receivedKeys = collectTopLevelKeys(r.json);
      if (!r.ok) record.error = r.text.slice(0, 160);
      diagnostics.push(record);

      if (parsed) {
        return {
          ok: true,
          source: parsed.source,
          value: parsed.value,
          classification: parsed.classification,
          state,
          attempts: diagnostics,
        };
      }
      lastDetail = r.text.slice(0, 160) || lastDetail;
    } catch (e: any) {
      diagnostics.push({
        endpoint: attempt.path,
        provider: attempt.source,
        latencyMs: 0,
        httpStatus: 0,
        resultState: 'NETWORK_ERROR',
        itemCount: 0,
        rawItemCount: 0,
        error: String(e?.message || 'request_threw').slice(0, 160),
      });
      lastDetail = e?.message || lastDetail;
    }
  }
  return {
    ok: false,
    source: 'HF Spaces',
    value: null,
    classification: null,
    detail: lastDetail,
    state: aggregateState(diagnostics),
    receivedKeys: diagnostics.find((a) => a.resultState === 'SCHEMA_MISMATCH')?.receivedKeys,
    attempts: diagnostics,
  };
}

/**
 * Structured on-chain/whale fallback from the two approved APEX Hugging Face Spaces.
 * No values are synthesized: rows without a real amount and transaction identifier
 * are discarded, and USD value remains absent unless the Space supplied it.
 *
 * Rows are kept whether or not the Space stated a direction — a directionless
 * whale transfer is still a real observation. Promoting an observation to a
 * directional trading signal happens downstream, and only for rows that carry an
 * explicit inbound/outbound flag.
 */
export function parseHfOnChainPayload(json: any): {
  container: string | null;
  rawCount: number;
  rows: HfOnChainRow[];
} {
  const { container, rows: rawRows } = pickHfRows(json, ONCHAIN_CONTAINERS);

  const out: HfOnChainRow[] = [];
  for (const row of rawRows) {
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
  return { container, rawCount: rawRows.length, rows: out.slice(0, 20) };
}

/**
 * Whales/on-chain: Space-2 service → Space-4 local whale routes.
 *
 * A 200 whose rows all fail APEX validation is reported as SCHEMA_MISMATCH with
 * the received keys, never as "this chain has no whales" — those are different
 * operational facts and were previously indistinguishable.
 */
export async function fetchHfSpaceOnChain(symbol?: string): Promise<{
  ok: boolean;
  source: string;
  rows: HfOnChainRow[];
  detail?: string;
  state: HfResultState;
  receivedKeys?: string[];
  /** Records the Space returned before APEX validation, for operator triage. */
  rawRowCount: number;
  attempts: HfRequestDiagnostics[];
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

  const diagnostics: HfRequestDiagnostics[] = [];
  let lastDetail = 'No on-chain rows';
  for (const attempt of attempts) {
    const r = await hfGet(attempt.path, attempt.origin);
    const parsed = parseHfOnChainPayload(r.json);
    const state = classifyHfPayload({
      ok: r.ok,
      container: parsed.container,
      rawCount: parsed.rawCount,
      usableCount: parsed.rows.length,
    });
    const record: HfRequestDiagnostics = {
      endpoint: attempt.path,
      provider: attempt.source,
      latencyMs: r.latencyMs,
      httpStatus: r.status,
      resultState: state,
      itemCount: parsed.rows.length,
      rawItemCount: parsed.rawCount,
    };
    if (state === 'SCHEMA_MISMATCH') record.receivedKeys = collectTopLevelKeys(r.json);
    if (!r.ok) record.error = r.text.slice(0, 160);
    diagnostics.push(record);

    if (state === 'SUCCESS') {
      return {
        ok: true,
        source: attempt.source,
        rows: parsed.rows,
        state,
        rawRowCount: parsed.rawCount,
        attempts: diagnostics,
      };
    }
    lastDetail = r.text.slice(0, 160) || lastDetail;
  }
  const schemaBreak = diagnostics.find((a) => a.resultState === 'SCHEMA_MISMATCH');
  return {
    ok: false,
    source: 'HF Spaces',
    rows: [],
    detail: lastDetail,
    state: aggregateState(diagnostics),
    receivedKeys: schemaBreak?.receivedKeys,
    rawRowCount: diagnostics.reduce((max, a) => Math.max(max, a.rawItemCount), 0),
    attempts: diagnostics,
  };
}

/** Whales summary wrapper retained for existing UI consumers. */
export async function fetchHfSpaceWhales(symbol?: string): Promise<{
  ok: boolean;
  source: string;
  count: number;
  sample: HfWhaleSample[];
  detail?: string;
  state: HfResultState;
  receivedKeys?: string[];
  rawRowCount: number;
  attempts: HfRequestDiagnostics[];
}> {
  const result = await fetchHfSpaceOnChain(symbol);
  if (!result.ok) {
    return {
      ok: false,
      source: result.source,
      count: 0,
      sample: [],
      detail: result.detail,
      state: result.state,
      receivedKeys: result.receivedKeys,
      rawRowCount: result.rawRowCount,
      attempts: result.attempts,
    };
  }
  return {
    ok: true,
    source: result.source,
    count: result.rows.length,
    sample: result.rows.slice(0, 4).map((row) => ({
      summary: `${row.amountUsd ? `$${row.amountUsd.toLocaleString()} · ` : ''}${row.amount} ${row.asset || ''} · ${row.chain || 'chain'} · ${row.transactionHash.slice(0, 12)}…`.trim().slice(0, 120),
    })),
    state: result.state,
    rawRowCount: result.rawRowCount,
    attempts: result.attempts,
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

/**
 * Reports the rate result alongside its diagnostics. The request path, price
 * extraction and null semantics are unchanged — only observability was added.
 */
async function fetchSpace2Rate(base: 'BTC' | 'ETH'): Promise<{ price: number | null; record: HfRequestDiagnostics }> {
  const path = `/api/service/rate?pair=${base}%2FUSDT`;
  const r = await hfGet(path, HF_SPACE_2_ORIGIN);
  const price = r.ok ? readPositivePrice(r.json) : null;
  const record: HfRequestDiagnostics = {
    endpoint: path,
    provider: 'HF Space-2 · rate service',
    latencyMs: r.latencyMs,
    httpStatus: r.status,
    resultState: classifyHfScalarPayload(r.ok, r.json, price != null),
    itemCount: price != null ? 1 : 0,
    rawItemCount: price != null ? 1 : 0,
  };
  if (record.resultState === 'SCHEMA_MISMATCH') record.receivedKeys = collectTopLevelKeys(r.json);
  if (!r.ok) record.error = r.text.slice(0, 160);
  return { price, record };
}

/**
 * Market fallback from the approved Hugging Face Spaces only.
 * Exchange public APIs are tried by the caller before this function.
 *
 * The verified tier order (Space-4 Short Hunter → Space-2 rate → Space-2 market
 * cache) and every acceptance condition are deliberately unchanged; this
 * function only additionally reports per-endpoint diagnostics.
 */
export async function fetchHfSpaceMarketPrices(): Promise<{
  ok: boolean;
  source: string;
  btcUsd: number | null;
  ethUsd: number | null;
  detail?: string;
  state: HfResultState;
  attempts: HfRequestDiagnostics[];
}> {
  const diagnostics: HfRequestDiagnostics[] = [];
  const recordScalar = (
    endpoint: string,
    provider: string,
    r: { ok: boolean; json: any; text: string; status: number; latencyMs: number },
    found: boolean,
  ): void => {
    const record: HfRequestDiagnostics = {
      endpoint,
      provider,
      latencyMs: r.latencyMs,
      httpStatus: r.status,
      resultState: classifyHfScalarPayload(r.ok, r.json, found),
      itemCount: found ? 1 : 0,
      rawItemCount: found ? 1 : 0,
    };
    if (record.resultState === 'SCHEMA_MISMATCH') record.receivedKeys = collectTopLevelKeys(r.json);
    if (!r.ok) record.error = r.text.slice(0, 160);
    diagnostics.push(record);
  };

  // Space-4 Short Hunter is preferred for live Futures-aware market context.
  const [s4btc, s4eth] = await Promise.all([
    hfGet('/api/short-hunter/market/BTC', HF_SPACE_4_ORIGIN),
    hfGet('/api/short-hunter/market/ETH', HF_SPACE_4_ORIGIN),
  ]);
  const s4BtcPrice = s4btc.ok ? readPositivePrice(s4btc.json) : null;
  const s4EthPrice = s4eth.ok ? readPositivePrice(s4eth.json) : null;
  recordScalar('/api/short-hunter/market/BTC', 'HF Space-4 · Short Hunter', s4btc, s4BtcPrice != null);
  recordScalar('/api/short-hunter/market/ETH', 'HF Space-4 · Short Hunter', s4eth, s4EthPrice != null);
  if (s4BtcPrice != null || s4EthPrice != null) {
    return {
      ok: true,
      source: 'HF Space-4 · Short Hunter',
      btcUsd: s4BtcPrice,
      ethUsd: s4EthPrice,
      state: 'SUCCESS',
      attempts: diagnostics,
    };
  }

  // Space-2's service/rate contract is provider-agnostic from APEX's perspective.
  const [s2Btc, s2Eth] = await Promise.all([fetchSpace2Rate('BTC'), fetchSpace2Rate('ETH')]);
  diagnostics.push(s2Btc.record, s2Eth.record);
  const s2BtcPrice = s2Btc.price;
  const s2EthPrice = s2Eth.price;
  if (s2BtcPrice != null || s2EthPrice != null) {
    return {
      ok: true,
      source: 'HF Space-2 · rate service',
      btcUsd: s2BtcPrice,
      ethUsd: s2EthPrice,
      state: 'SUCCESS',
      attempts: diagnostics,
    };
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
  recordScalar('/api/market?symbols=BTC,ETH&limit=2', 'HF Space-2 · market cache', s2Market, marketBtc != null || marketEth != null);
  if (marketBtc != null || marketEth != null) {
    return {
      ok: true,
      source: 'HF Space-2 · market cache',
      btcUsd: marketBtc,
      ethUsd: marketEth,
      state: 'SUCCESS',
      attempts: diagnostics,
    };
  }

  return {
    ok: false,
    source: 'HF Spaces',
    btcUsd: null,
    ethUsd: null,
    detail: [s4btc.text, s4eth.text, s2Market.text].filter(Boolean).map((v) => String(v).slice(0, 80)).join(' · ') || 'No market price',
    state: aggregateState(diagnostics),
    attempts: diagnostics,
  };
}
