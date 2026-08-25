import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

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
const fetchedAt = new Date().toISOString();
const USER_AGENT = 'APEX-Structural-Remediation/1.0 (+historical-research)';
const VISION_BASE = 'https://data.binance.vision/data/futures/um';

// Additive mode. `--add-symbols=SOLUSDT,BNBUSDT` appends new per-symbol series to the existing
// dataset and amends the manifest in place. It never rewrites an existing symbol, and never
// re-derives the shared news/sentiment series, because those two files feed the per-symbol
// identitySha256 that the sealed holdout is pinned to.
const ADD_SYMBOLS = (process.argv.find((value) => value.startsWith('--add-symbols='))?.slice(14) ?? '')
  .split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
const SEALED_SYMBOLS = new Set(['BTCUSDT', 'ETHUSDT']);

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
  // Recorded with forward slashes on every platform so the manifest stays byte-comparable
  // regardless of where it was generated.
  return { file: path.relative(root, file).split(path.sep).join('/'), contentSha256, fileSha256: sha256(bytes), bytes: bytes.length, coverage: payload.coverage };
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

function csvCell(cells: string[], index: number): number {
  const value = cells[index];
  return value === undefined || value === '' ? Number.NaN : Number(value);
}

// Drops the CSV header row (and any blank trailing line) by requiring a numeric first column.
function epochKeyedCsvRows(text: string): string[][] {
  return text.trim().split(/\r?\n/).map((line) => line.split(',')).filter((cells) => Number.isFinite(csvCell(cells, 0)));
}

function utcMonthKeys(from: string, to: string): string[] {
  return utcMonths(from, to).map((month) => month.from.slice(0, 7));
}

async function archivePages<T>(urls: string[], limit: number, parse: (text: string) => T[]) {
  const pages = await mapLimit(urls, limit, async (url) => {
    try {
      const body = await fetchBytes(url);
      const parsed = parse(unzipCsv(body, url));
      return { parsed, provenance: { url, sha256: sha256(body), bytes: body.length, rows: parsed.length, fetchedAt } as ProvenancePage | null };
    } catch (error) {
      if (String(error).includes('not_found:')) return { parsed: [] as T[], provenance: null };
      throw error;
    }
  });
  const rows: T[] = [];
  const provenance: ProvenancePage[] = [];
  pages.forEach((page) => { rows.push(...page.parsed); if (page.provenance) provenance.push(page.provenance); });
  return { rows, provenance, missing: pages.filter((page) => !page.provenance).length };
}

// Monthly-archive equivalent of acquireKlines. Same row shape, same 1h interval; used for symbols
// added after the original run because fapi.binance.com is not resolvable from this network while
// the official archive host is. The two transports were checked against each other before use.
async function acquireArchiveKlines(symbol: string, from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T23:59:59.999Z`);
  const parse = (text: string) => epochKeyedCsvRows(text).map((cells) => ({
    t: csvCell(cells, 0), o: csvCell(cells, 1), h: csvCell(cells, 2), l: csvCell(cells, 3), c: csvCell(cells, 4), v: csvCell(cells, 5),
  })).filter((row) => Number.isFinite(row.t) && Number.isFinite(row.c) && row.t % 3_600_000 === 0 && row.t >= start && row.t <= end);
  const monthlyUrls = utcMonthKeys(from, to).map((month) => `${VISION_BASE}/monthly/klines/${symbol}/1h/${symbol}-1h-${month}.zip`);
  const monthly = await archivePages(monthlyUrls, 6, parse);
  const byTimestamp = new Map(monthly.rows.map((row) => [row.t, row]));

  // Monthly archives are not always complete: SOLUSDT-1h-2022-02 stops on the 25th even though the
  // daily archives for the 26th-28th exist. Any day with a missing hour is therefore refetched at
  // daily granularity rather than left as a silent hole in the series.
  const allDates = utcDates(from, to);
  const incompleteDates = allDates.filter((date) => {
    const dayStart = Date.parse(`${date}T00:00:00.000Z`);
    for (let hour = 0; hour < 24; hour += 1) {
      const timestamp = dayStart + hour * 3_600_000;
      if (timestamp >= start && timestamp <= end && !byTimestamp.has(timestamp)) return true;
    }
    return false;
  });
  const daily = incompleteDates.length
    ? await archivePages(incompleteDates.map((date) => `${VISION_BASE}/daily/klines/${symbol}/1h/${symbol}-1h-${date}.zip`), 8, parse)
    : { rows: [], provenance: [], missing: 0 };
  daily.rows.forEach((row) => byTimestamp.set(row.t, row));

  const unique = [...byTimestamp.values()].sort((left, right) => left.t - right.t);
  const stillMissing = allDates.length * 24 - unique.length;
  return writeSeries(`${symbol.toLowerCase()}-candles-1h.json`, {
    schemaVersion: 1, kind: 'candles', source: 'Binance Public Data monthly klines archives, with daily archives filling incomplete months',
    semanticLabel: 'verified closed OHLCV candles', symbol, interval: '1h', coverage: coverage(unique),
    limitations: [
      'Single-venue perpetual-futures candles.',
      'Sourced from the official Binance archive rather than the fapi REST endpoint, which is not resolvable from the acquiring network. The archive was verified value-identical to the existing REST-derived btcusdt 1h series for 2022-01 (744/744 rows matched, 0 differing).',
      ...(monthly.missing ? [`${monthly.missing} of ${monthlyUrls.length} monthly archives were absent upstream.`] : []),
      ...(incompleteDates.length ? [`${incompleteDates.length} day(s) were incomplete in the monthly archives and were backfilled from daily archives: ${incompleteDates.join(', ')}.`] : []),
      ...(stillMissing > 0 ? [`${stillMissing} of ${allDates.length * 24} expected hourly rows are absent from both the monthly and daily archives and are not represented.`] : []),
    ],
    provenance: [...monthly.provenance, ...daily.provenance], rows: unique,
  });
}

// Monthly-archive equivalent of acquireFunding. The archive carries calc_time,
// funding_interval_hours and last_funding_rate only, so there is no mark price to record.
async function acquireArchiveFunding(symbol: string, from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T23:59:59.999Z`);
  const urls = utcMonthKeys(from, to).map((month) => `${VISION_BASE}/monthly/fundingRate/${symbol}/${symbol}-fundingRate-${month}.zip`);
  const { rows, provenance, missing } = await archivePages(urls, 6, (text) => epochKeyedCsvRows(text).map((cells) => ({
    t: csvCell(cells, 0), rate: csvCell(cells, 2), mark: null as number | null,
  })).filter((row) => Number.isFinite(row.t) && Number.isFinite(row.rate) && row.t >= start && row.t <= end));
  const unique = [...new Map(rows.map((row) => [row.t, row])).values()].sort((left, right) => left.t - right.t);
  // The funding interval is a venue setting, not a constant: it was shortened for some symbols
  // during stress windows. The label and limitations are therefore derived from the observed
  // spacing rather than asserted as 8h.
  const spacing = new Map<number, number>();
  for (let index = 1; index < unique.length; index += 1) {
    const hours = Math.round((unique[index].t - unique[index - 1].t) / 3_600_000);
    spacing.set(hours, (spacing.get(hours) ?? 0) + 1);
  }
  const cadence = [...spacing.entries()].sort((left, right) => right[1] - left[1]);
  const modalHours = cadence[0]?.[0] ?? 8;
  const offCadenceMonths = [...new Set(unique
    .filter((row, index) => index > 0 && Math.round((row.t - unique[index - 1].t) / 3_600_000) !== modalHours)
    .map((row) => iso(row.t).slice(0, 7)))].sort();
  return writeSeries(`${symbol.toLowerCase()}-funding.json`, {
    schemaVersion: 1, kind: 'funding_rate', source: 'Binance Public Data monthly fundingRate archives', semanticLabel: 'realized perpetual funding rate', symbol,
    interval: offCadenceMonths.length ? `${modalHours}h-event (mixed interval)` : `${modalHours}h-event`, coverage: coverage(unique),
    limitations: [
      'Single-venue funding; basis leg is not reconstructed.',
      'The monthly fundingRate archive exposes calc_time, funding_interval_hours and last_funding_rate only, so mark is null on every row. The REST-derived btcusdt/ethusdt files carry mark 0 on every row, so neither transport supplies a usable mark price.',
      ...(offCadenceMonths.length
        ? [`Funding cadence is not uniform. Observed spacing histogram in hours: ${JSON.stringify(Object.fromEntries(cadence))}. Non-${modalHours}h spacing occurs in ${offCadenceMonths.join(', ')}; these are real venue interval changes, not missing rows.`]
        : []),
      ...(missing ? [`${missing} of ${urls.length} monthly archives were absent upstream and are simply not represented.`] : []),
    ],
    provenance, rows: unique,
  });
}

// Binance publishes every archive as a ZIP holding a single deflated CSV. This is decoded in
// process rather than by shelling out to `unzip`, which does not exist on the Windows release
// target; the decoded text is byte-identical to `unzip -p` output.
function unzipCsv(body: Buffer, key: string): string {
  const endOfCentralDirectory = body.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endOfCentralDirectory < 0) throw new Error(`zip_missing_central_directory:${key}`);
  const entryCount = body.readUInt16LE(endOfCentralDirectory + 10);
  if (entryCount < 1) throw new Error(`zip_no_entries:${key}`);
  let cursor = body.readUInt32LE(endOfCentralDirectory + 16);
  const parts: string[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (body.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`zip_bad_central_header:${key}`);
    const method = body.readUInt16LE(cursor + 10);
    const compressedSize = body.readUInt32LE(cursor + 20);
    const uncompressedSize = body.readUInt32LE(cursor + 24);
    const nameLength = body.readUInt16LE(cursor + 28);
    const extraLength = body.readUInt16LE(cursor + 30);
    const commentLength = body.readUInt16LE(cursor + 32);
    const localOffset = body.readUInt32LE(cursor + 42);
    if (body.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`zip_bad_local_header:${key}`);
    const dataOffset = localOffset + 30 + body.readUInt16LE(localOffset + 26) + body.readUInt16LE(localOffset + 28);
    const compressed = body.subarray(dataOffset, dataOffset + compressedSize);
    const inflated = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
    if (!inflated) throw new Error(`zip_unsupported_compression_${method}:${key}`);
    if (inflated.length !== uncompressedSize) throw new Error(`zip_size_mismatch:${key}`);
    parts.push(inflated.toString('utf8'));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return parts.join('\n');
}

async function acquireMetrics(symbol: string, from: string, to: string) {
  const dates = utcDates(from, to);
  const urls = dates.map((date) => `${VISION_BASE}/daily/metrics/${symbol}/${symbol}-metrics-${date}.zip`);
  const { rows, provenance, missing } = await archivePages(urls, 12, (text) => text.trim().split(/\r?\n/).slice(1).map((line) => {
    const value = line.split(',');
    return {
      t: Date.parse(`${value[0].replace(' ', 'T')}Z`), oi: csvCell(value, 2), oiUsd: csvCell(value, 3), topAccountRatio: csvCell(value, 4),
      topPositionRatio: csvCell(value, 5), accountRatio: csvCell(value, 6), takerRatio: csvCell(value, 7),
    };
  }).filter((row) => Number.isFinite(row.t) && Number.isFinite(row.oi) && row.t % 3_600_000 === 0));
  const unique = [...new Map(rows.map((row) => [row.t, row])).values()].sort((left, right) => left.t - right.t);
  // The four ratio columns are absent from the upstream archive for much of 2022 and serialize as
  // null. Reported as measured rather than as a fixed claim, because the cutover date is not uniform.
  const withRatios = unique.filter((row) => [row.topAccountRatio, row.topPositionRatio, row.accountRatio, row.takerRatio].every((value) => Number.isFinite(value)));
  return writeSeries(`${symbol.toLowerCase()}-open-interest-top-trader-1h.json`, {
    schemaVersion: 1, kind: 'open_interest_top_trader_flow', source: 'Binance Public Data daily metrics archives',
    semanticLabel: 'open interest plus top-trader and taker-flow ratios', symbol, interval: '1h', coverage: coverage(unique),
    limitations: [
      'Top-trader and taker ratios are a large-participant proxy, not entity-classified on-chain whale transfers.',
      `Open interest is populated across the whole window, but the four ratio columns are absent upstream for much of 2022 and serialize as null. Measured here: ${withRatios.length}/${unique.length} rows carry all four ratios; the earliest such row is ${withRatios.length ? iso(withRatios[0].t) : 'none'}.`,
      ...(missing ? [`${missing} of ${urls.length} daily archives were absent upstream and are simply not represented.`] : []),
    ], provenance, rows: unique,
  });
}

async function acquireBookDepth(symbol: string, from: string, to: string) {
  const dates = utcDates(from, to, 7);
  const urls = dates.map((date) => `${VISION_BASE}/daily/bookDepth/${symbol}/${symbol}-bookDepth-${date}.zip`);
  const { rows, provenance, missing } = await archivePages(urls, 8, (text) => {
    const groups = new Map<number, { bidDepth: number; askDepth: number; bidNotional: number; askNotional: number }>();
    for (const line of text.trim().split(/\r?\n/).slice(1)) {
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
    return [...groups.entries()].map(([t, value]) => ({
      t, ...value, imbalance: (value.bidNotional - value.askNotional) / Math.max(1, value.bidNotional + value.askNotional),
    })).sort((left, right) => left.t - right.t);
  });
  const unique = [...new Map(rows.map((row) => [row.t, row])).values()].sort((left, right) => left.t - right.t);
  return writeSeries(`${symbol.toLowerCase()}-order-book-depth-weekly-sample.json`, {
    schemaVersion: 1, kind: 'order_book_depth', source: 'Binance Public Data bookDepth archives', semanticLabel: 'real ±1% order-book depth imbalance', symbol,
    interval: '1h within weekly sampled days', coverage: coverage(unique),
    limitations: [
      'Weekly sampled days only.',
      'Provides depth, not top-of-book spread.',
      'Single venue.',
      ...(missing ? [`${missing} of ${urls.length} sampled daily archives were absent upstream and are simply not represented.`] : []),
    ], provenance, rows: unique,
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

type Artifact = ReturnType<typeof writeSeries>;

// Merges new artifact entries into the existing manifest and recomputes integrity.contentSha256,
// which loadHistoricalSignalBundle recomputes on every read. Existing entries are left byte-for-byte
// alone unless the same file was re-acquired. Called once per symbol so an interrupted run still
// leaves a manifest that validates.
function amendManifest(added: Artifact[]): number {
  const manifestPath = path.join(outDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`manifest_missing_for_additive_run:${manifestPath}`);
  const core = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown> & { artifacts: Artifact[] };
  delete (core as Record<string, unknown>).integrity;
  const artifacts = [...core.artifacts];
  for (const artifact of added) {
    // Keyed on basename because that is the identity loadHistoricalSignalBundle resolves by, and it
    // stays stable if a historical entry was recorded with a different path separator.
    const index = artifacts.findIndex((value) => path.basename(value.file) === path.basename(artifact.file));
    if (index >= 0) artifacts[index] = artifact;
    else artifacts.push(artifact);
  }
  core.artifacts = artifacts;
  core.amendedAt = fetchedAt;
  const manifest = { ...core, integrity: { algorithm: 'sha256', contentSha256: sha256(JSON.stringify(core)) } };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return artifacts.length;
}

// Time windows match the existing per-symbol convention: candles and funding over the ethusdt
// window, open interest over the shared 2022-2025 window, book depth over the shared weekly-sample
// window. All four files are written because loadHistoricalSignalBundle requires the full set.
async function acquireAddedSymbols(): Promise<void> {
  for (const symbol of ADD_SYMBOLS) {
    if (SEALED_SYMBOLS.has(symbol)) throw new Error(`refusing_to_rewrite_sealed_symbol:${symbol}`);
  }
  for (const symbol of ADD_SYMBOLS) {
    const added: Artifact[] = [];
    added.push(await acquireArchiveKlines(symbol, '2021-01-01', '2025-12-31'));
    added.push(await acquireArchiveFunding(symbol, '2021-01-01', '2025-12-31'));
    added.push(await acquireMetrics(symbol, '2022-01-01', '2025-12-31'));
    added.push(await acquireBookDepth(symbol, '2023-01-02', '2025-12-29'));
    const total = amendManifest(added);
    console.log(`[additive] ${symbol} ${added.map((value) => `${path.basename(value.file)}=${value.coverage.rows}`).join(' ')} manifestArtifacts=${total}`);
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  if (ADD_SYMBOLS.length) {
    await acquireAddedSymbols();
    return;
  }
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
