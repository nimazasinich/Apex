import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

type ProvenancePage = {
  url: string;
  sha256: string;
  bytes: number;
  rows: number;
  fetchedAt: string;
};

type SeriesPayload = {
  schemaVersion: 1;
  kind: string;
  source: string;
  semanticLabel: string;
  symbol: string;
  interval: string;
  coverage: { from: string | null; to: string | null; rows: number };
  limitations: string[];
  provenance: ProvenancePage[];
  rows: unknown[];
};

const root = path.resolve(import.meta.dirname, '../..');
const defaultOut = path.join(root, 'QA/profitability-structural-remediation/data');
const outDir = path.resolve(process.argv.find((value) => value.startsWith('--out='))?.slice(6) || defaultOut);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-profitability-data-'));
const fetchedAt = new Date().toISOString();
const USER_AGENT = 'APEX-Structural-Remediation/1.0 (+historical-research)';

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBytes(url: string, retries = 4): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      if (response.status === 404) throw new Error(`not_found:${url}`);
      if (response.status === 418 || response.status === 429 || response.status >= 500) {
        await sleep(750 * (attempt + 1));
        continue;
      }
      throw new Error(`http_${response.status}:${url}`);
    } catch (error) {
      lastError = error;
      if (String(error).includes('not_found:')) throw error;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`fetch_failed:${url}`);
}

async function fetchJsonPage(url: string): Promise<{ body: Buffer; json: unknown; provenance: ProvenancePage }> {
  const body = await fetchBytes(url);
  return {
    body,
    json: JSON.parse(body.toString('utf8')),
    provenance: { url, sha256: sha256(body), bytes: body.length, rows: 0, fetchedAt },
  };
}

function writeSeries(fileName: string, payload: SeriesPayload): { file: string; contentSha256: string; fileSha256: string; bytes: number; coverage: SeriesPayload['coverage'] } {
  const contentSha256 = sha256(JSON.stringify(payload));
  const envelope = {
    ...payload,
    integrity: {
      algorithm: 'sha256' as const,
      contentSha256,
      provenancePageCount: payload.provenance.length,
      verifiedAtWrite: true,
    },
  };
  const bytes = Buffer.from(`${JSON.stringify(envelope)}\n`);
  const file = path.join(outDir, fileName);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return { file: path.relative(root, file), contentSha256, fileSha256: sha256(bytes), bytes: bytes.length, coverage: payload.coverage };
}

function coverage(rows: Array<{ t: number }>): SeriesPayload['coverage'] {
  return {
    from: rows.length ? iso(rows[0].t) : null,
    to: rows.length ? iso(rows.at(-1)!.t) : null,
    rows: rows.length,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

function utcDates(from: string, to: string, stepDays = 1): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`).getTime();
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  for (let timestamp = cursor; timestamp <= end; timestamp += stepDays * 86_400_000) dates.push(iso(timestamp).slice(0, 10));
  return dates;
}

function utcMonths(from: string, to: string): Array<{ from: string; to: string }> {
  const output: Array<{ from: string; to: string }> = [];
  let cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    output.push({ from: iso(cursor.getTime()).slice(0, 10), to: iso(next.getTime() - 1).slice(0, 10) });
    cursor = next;
  }
  return output;
}

async function acquireKlines(symbol: string, from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T23:59:59.999Z`);
  const rows: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }> = [];
  const provenance: ProvenancePage[] = [];
  let cursor = start;
  while (cursor <= end) {
    const query = new URLSearchParams({ symbol, interval: '1h', limit: '1500', startTime: String(cursor), endTime: String(end) });
    const url = `https://fapi.binance.com/fapi/v1/klines?${query}`;
    const page = await fetchJsonPage(url);
    const values = Array.isArray(page.json) ? page.json as unknown[][] : [];
    if (!values.length) break;
    const parsed = values.map((value) => ({
      t: Number(value[0]), o: Number(value[1]), h: Number(value[2]), l: Number(value[3]), c: Number(value[4]), v: Number(value[5]),
    })).filter((row) => Number.isFinite(row.t) && row.t >= start && row.t <= end);
    rows.push(...parsed);
    provenance.push({ ...page.provenance, rows: parsed.length });
    const next = Number(values.at(-1)?.[0]) + 3_600_000;
    if (!Number.isFinite(next) || next <= cursor) break;
    cursor = next;
    await sleep(30);
  }
  const unique = [...new Map(rows.map((row) => [row.t, row])).values()].sort((left, right) => left.t - right.t);
  return writeSeries(`${symbol.toLowerCase()}-candles-1h.json`, {
    schemaVersion: 1, kind: 'candles', source: 'Binance USD-M Futures public REST', semanticLabel: 'verified closed OHLCV candles', symbol,
    interval: '1h', coverage: coverage(unique), limitations: ['Single-venue perpetual-futures candles.'], provenance, rows: unique,
  });
}

async function acquireFunding(symbol: string, from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T23:59:59.999Z`);
  const rows: Array<{ t: number; rate: number; mark: number | null }> = [];
  const provenance: ProvenancePage[] = [];
  let cursor = start;
  while (cursor <= end) {
    const query = new URLSearchParams({ symbol, limit: '1000', startTime: String(cursor), endTime: String(end) });
    const url = `https://fapi.binance.com/fapi/v1/fundingRate?${query}`;
    const page = await fetchJsonPage(url);
    const values = Array.isArray(page.json) ? page.json as Array<Record<string, unknown>> : [];
    if (!values.length) break;
    const parsed = values.map((value) => ({
      t: Number(value.fundingTime), rate: Number(value.fundingRate), mark: Number.isFinite(Number(value.markPrice)) ? Number(value.markPrice) : null,
    })).filter((row) => Number.isFinite(row.t) && Number.isFinite(row.rate) && row.t >= start && row.t <= end);
    rows.push(...parsed);
    provenance.push({ ...page.provenance, rows: parsed.length });
    const next = Number(values.at(-1)?.fundingTime) + 1;
    if (!Number.isFinite(next) || next <= cursor) break;
    cursor = next;
    await sleep(40);
  }
  const unique = [...new Map(rows.map((row) => [row.t, row])).values()].sort((left, right) => left.t - right.t);
  return writeSeries(`${symbol.toLowerCase()}-funding.json`, {
    schemaVersion: 1, kind: 'funding_rate', source: 'Binance USD-M Futures public REST', semanticLabel: 'realized perpetual funding rate', symbol,
    interval: '8h-event', coverage: coverage(unique), limitations: ['Single-venue funding; basis leg is not reconstructed.'], provenance, rows: unique,
  });
}

function unzipCsv(body: Buffer, key: string): string {
  const zipPath = path.join(tempDir, `${sha256(key).slice(0, 16)}.zip`);
  fs.writeFileSync(zipPath, body);
  const result = spawnSync('unzip', ['-p', zipPath], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  fs.unlinkSync(zipPath);
  if (result.status !== 0) throw new Error(`unzip_failed:${key}:${result.stderr}`);
  return result.stdout;
}

async function acquireMetrics(symbol: string, from: string, to: string) {
  const rows: Array<{ t: number; oi: number; oiUsd: number; topAccountRatio: number; topPositionRatio: number; accountRatio: number; takerRatio: number }> = [];
  const dates = utcDates(from, to);
  const pages = await mapLimit(dates, 12, async (date) => {
    const url = `https://data.binance.vision/data/futures/um/daily/metrics/${symbol}/${symbol}-metrics-${date}.zip`;
    try {
      const body = await fetchBytes(url);
      const lines = unzipCsv(body, url).trim().split(/\r?\n/).slice(1);
      const parsed = lines.map((line) => {
        const value = line.split(',');
        return {
          t: Date.parse(`${value[0].replace(' ', 'T')}Z`), oi: Number(value[2]), oiUsd: Number(value[3]), topAccountRatio: Number(value[4]),
          topPositionRatio: Number(value[5]), accountRatio: Number(value[6]), takerRatio: Number(value[7]),
        };
      }).filter((row) => Number.isFinite(row.t) && Number.isFinite(row.oi) && row.t % 3_600_000 === 0);
      return { parsed, provenance: { url, sha256: sha256(body), bytes: body.length, rows: parsed.length, fetchedAt } };
    } catch (error) {
      if (String(error).includes('not_found:')) return { parsed: [], provenance: null };
      throw error;
    }
  });
  const provenance: ProvenancePage[] = [];
  pages.forEach((page) => { rows.push(...page.parsed); if (page.provenance) provenance.push(page.provenance); });
  const unique = [...new Map(rows.map((row) => [row.t, row])).values()].sort((left, right) => left.t - right.t);
  return writeSeries(`${symbol.toLowerCase()}-open-interest-top-trader-1h.json`, {
    schemaVersion: 1, kind: 'open_interest_top_trader_flow', source: 'Binance Public Data daily metrics archives',
    semanticLabel: 'open interest plus top-trader and taker-flow ratios', symbol, interval: '1h', coverage: coverage(unique),
    limitations: ['Top-trader and taker ratios are a large-participant proxy, not entity-classified on-chain whale transfers.'], provenance, rows: unique,
  });
}

async function acquireBookDepth(symbol: string, from: string, to: string) {
  const rows: Array<{ t: number; bidDepth: number; askDepth: number; bidNotional: number; askNotional: number; imbalance: number }> = [];
  const dates = utcDates(from, to, 7);
  const pages = await mapLimit(dates, 8, async (date) => {
    const url = `https://data.binance.vision/data/futures/um/daily/bookDepth/${symbol}/${symbol}-bookDepth-${date}.zip`;
    try {
      const body = await fetchBytes(url);
      const lines = unzipCsv(body, url).trim().split(/\r?\n/).slice(1);
      const groups = new Map<number, { bidDepth: number; askDepth: number; bidNotional: number; askNotional: number }>();
      for (const line of lines) {
        const value = line.split(',');
        const rawTime = Date.parse(`${value[0].replace(' ', 'T')}Z`);
        if (!Number.isFinite(rawTime)) continue;
        const t = Math.floor(rawTime / 3_600_000) * 3_600_000;
        const pct = Number(value[1]);
        if (Math.abs(pct) !== 1) continue;
        const group = groups.get(t) ?? { bidDepth: 0, askDepth: 0, bidNotional: 0, askNotional: 0 };
        if (pct < 0) { group.bidDepth += Number(value[2]); group.bidNotional += Number(value[3]); }
        else { group.askDepth += Number(value[2]); group.askNotional += Number(value[3]); }
        groups.set(t, group);
      }
      const parsed = [...groups.entries()].map(([t, value]) => ({
        t, ...value, imbalance: (value.bidNotional - value.askNotional) / Math.max(1, value.bidNotional + value.askNotional),
      })).sort((left, right) => left.t - right.t);
      return { parsed, provenance: { url, sha256: sha256(body), bytes: body.length, rows: parsed.length, fetchedAt } };
    } catch (error) {
      if (String(error).includes('not_found:')) return { parsed: [], provenance: null };
      throw error;
    }
  });
  const provenance: ProvenancePage[] = [];
  pages.forEach((page) => { rows.push(...page.parsed); if (page.provenance) provenance.push(page.provenance); });
  const unique = [...new Map(rows.map((row) => [row.t, row])).values()].sort((left, right) => left.t - right.t);
  return writeSeries(`${symbol.toLowerCase()}-order-book-depth-weekly-sample.json`, {
    schemaVersion: 1, kind: 'order_book_depth', source: 'Binance Public Data bookDepth archives', semanticLabel: 'real ±1% order-book depth imbalance', symbol,
    interval: '1h within weekly sampled days', coverage: coverage(unique),
    limitations: ['Weekly sampled days only.', 'Provides depth, not top-of-book spread.', 'Single venue.'], provenance, rows: unique,
  });
}

function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function tag(item: string, name: string): string {
  const match = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeXml(match[1].trim()) : '';
}

async function acquireNews(from: string, to: string) {
  const pages = await mapLimit(utcMonths(from, to), 3, async (month) => {
    const query = encodeURIComponent(`(bitcoin OR ethereum OR crypto) after:${month.from} before:${month.to}`);
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
    const body = await fetchBytes(url);
    const xml = body.toString('utf8');
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
    const parsed = items.map((item) => {
      const title = tag(item, 'title');
      const published = Date.parse(tag(item, 'pubDate'));
      const lower = title.toLowerCase();
      const symbols = [lower.includes('bitcoin') || /\bbtc\b/.test(lower) ? 'BTCUSDT' : '', lower.includes('ethereum') || /\beth\b/.test(lower) ? 'ETHUSDT' : ''].filter(Boolean);
      return { t: published, title, url: tag(item, 'link'), publisher: tag(item, 'source'), symbols: symbols.length ? symbols : ['BTCUSDT', 'ETHUSDT'] };
    }).filter((row) => Number.isFinite(row.t) && row.title);
    return { parsed, provenance: { url, sha256: sha256(body), bytes: body.length, rows: parsed.length, fetchedAt } };
  });
  const rows = pages.flatMap((page) => page.parsed).sort((left, right) => left.t - right.t);
  const unique = [...new Map(rows.map((row) => [`${row.t}:${row.title}`, row])).values()];
  return writeSeries('crypto-news-google-rss.json', {
    schemaVersion: 1, kind: 'news', source: 'Google News RSS index', semanticLabel: 'dated crypto-news headline index', symbol: 'BTCUSDT,ETHUSDT', interval: 'event',
    coverage: coverage(unique), limitations: ['RSS search is an index, not a complete newswire.', 'Publishers may revise or remove linked content.', 'Headline text only.'],
    provenance: pages.map((page) => page.provenance), rows: unique,
  });
}

async function acquireSentiment() {
  const url = 'https://api.alternative.me/fng/?limit=0&format=json';
  const page = await fetchJsonPage(url);
  const data = (page.json as { data?: Array<Record<string, unknown>> }).data ?? [];
  const rows = data.map((value) => ({ t: Number(value.timestamp) * 1000, value: Number(value.value), classification: String(value.value_classification || '') }))
    .filter((row) => Number.isFinite(row.t) && Number.isFinite(row.value)).sort((left, right) => left.t - right.t);
  return writeSeries('crypto-fear-greed-daily.json', {
    schemaVersion: 1, kind: 'sentiment', source: 'Alternative.me Crypto Fear & Greed API', semanticLabel: 'daily crypto fear/greed index', symbol: 'CRYPTO_MARKET', interval: '1d',
    coverage: coverage(rows), limitations: ['Market-wide daily index, not symbol-specific or intraday model sentiment.'], provenance: [{ ...page.provenance, rows: rows.length }], rows,
  });
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const artifacts = [];
  artifacts.push(await acquireKlines('BTCUSDT', '2020-09-01', '2025-12-31'));
  artifacts.push(await acquireKlines('ETHUSDT', '2021-01-01', '2025-12-31'));
  artifacts.push(await acquireFunding('BTCUSDT', '2020-09-01', '2025-12-31'));
  artifacts.push(await acquireFunding('ETHUSDT', '2021-01-01', '2025-12-31'));
  artifacts.push(await acquireMetrics('BTCUSDT', '2022-01-01', '2025-12-31'));
  artifacts.push(await acquireMetrics('ETHUSDT', '2022-01-01', '2025-12-31'));
  artifacts.push(await acquireBookDepth('BTCUSDT', '2023-01-02', '2025-12-29'));
  artifacts.push(await acquireBookDepth('ETHUSDT', '2023-01-02', '2025-12-29'));
  artifacts.push(await acquireNews('2022-01-01', '2025-12-31'));
  artifacts.push(await acquireSentiment());

  const unavailable = [
    {
      kind: 'spread', status: 'unavailable', reason: 'Binance historical bookDepth archives contain depth bands but no top-of-book bid/ask spread. The historical bookTicker archive ends in 2023 and does not cover the sealed 2024-2025 1h holdout.',
    },
    {
      kind: 'entity_classified_whale_flow', status: 'unavailable', reason: 'Whale Alert rejected unauthenticated access and no owner-provided on-chain/entity-labelled archive or API credential was supplied. Binance top-trader/taker flow is retained only as an explicitly labelled proxy.',
    },
  ];
  const manifestCore = {
    schemaVersion: 1,
    generatedAt: fetchedAt,
    immutableUntil: 'A new manifest is created; existing series identities must never be overwritten silently.',
    contentIdentityPolicy: 'Each file records a SHA-256 over its payload; this manifest records a SHA-256 over exact file bytes and every upstream response page has its own SHA-256.',
    artifacts,
    unavailable,
  };
  const manifest = { ...manifestCore, integrity: { algorithm: 'sha256', contentSha256: sha256(JSON.stringify(manifestCore)) } };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ outDir, artifacts: artifacts.map((value) => ({ file: value.file, coverage: value.coverage, bytes: value.bytes })), unavailable }, null, 2));
}

main().finally(() => fs.rmSync(tempDir, { recursive: true, force: true }));
