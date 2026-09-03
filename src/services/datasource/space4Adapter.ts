import {
  CanonicalCandle,
  CanonicalEnvelope,
  CanonicalFearGreed,
  CanonicalFundingRate,
  CanonicalNewsEvent,
  CanonicalOpenInterest,
  CanonicalShortHunterSnapshot,
  CanonicalWhaleFlow,
  normalizeEpochMs,
  validateCandleInvariants,
} from '../../contracts/datasource/hfDatasourceTypes';
import { smartFetchJson } from '../proxyFetch';

export const SPACE_4_ORIGIN =
  process.env.HF_SPACE_4_ORIGIN || 'https://really-amin-datasourceforcryptocurrency-4.hf.space';

function sanitizeSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/[-_/]/g, '');
}

export class Space4Adapter {
  constructor(private origin = SPACE_4_ORIGIN) {}

  async probe(): Promise<{ ok: boolean; latencyMs: number; status: number; error?: string }> {
    const start = Date.now();
    try {
      const res = await smartFetchJson(`${this.origin}/api/apex/coverage`, {
        timeoutMs: 8000,
        logKey: 'space4_probe_coverage',
      });
      const latencyMs = Date.now() - start;
      return {
        ok: res.ok,
        latencyMs,
        status: res.status,
        error: res.error,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        status: 0,
        error: err instanceof Error ? err.message : 'probe_failed',
      };
    }
  }

  async getTradingPairs(): Promise<string[]> {
    try {
      const res = await fetch(`${this.origin}/trading_pairs.txt`, {
        headers: { Accept: 'text/plain' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return [];
      const text = await res.text();
      return [...new Set(text.split(/\r?\n/).map((s) => s.trim().toUpperCase()).filter(Boolean))];
    } catch {
      return [];
    }
  }

  async getCoverage(): Promise<Record<string, unknown> | null> {
    const res = await smartFetchJson(`${this.origin}/api/apex/coverage`, {
      timeoutMs: 10000,
      logKey: 'space4_coverage',
    });
    return res.ok && res.json ? res.json : null;
  }

  async getHistory(
    symbol: string,
    interval = '1h',
    limit = 100,
    startMs?: number,
    endMs?: number,
  ): Promise<CanonicalEnvelope<CanonicalCandle[]>> {
    const cleanSymbol = sanitizeSymbol(symbol);
    const params = new URLSearchParams({
      symbol: cleanSymbol,
      interval,
      limit: String(limit),
    });
    if (startMs) params.set('start', String(startMs));
    if (endMs) params.set('end', String(endMs));

    const url = `${this.origin}/api/history?${params.toString()}`;
    const start = Date.now();
    const res = await smartFetchJson(url, {
      timeoutMs: 15000,
      logKey: 'space4_history',
    });
    const latencyMs = Date.now() - start;

    const data: CanonicalCandle[] = [];
    if (res.ok && Array.isArray(res.json?.data)) {
      for (const row of res.json.data) {
        const candle: CanonicalCandle = {
          symbol: cleanSymbol,
          interval,
          openTimeMs: normalizeEpochMs(row.timestamp ?? row.openTime ?? row.time),
          closeTimeMs: normalizeEpochMs(row.closeTime),
          open: Number(row.open),
          high: Number(row.high),
          low: Number(row.low),
          close: Number(row.close),
          volume: Number(row.volume ?? 0),
          quoteVolume: row.quoteVolume ? Number(row.quoteVolume) : undefined,
          provider: 'space4_binance_vision',
        };
        if (candle.openTimeMs > 0 && validateCandleInvariants(candle)) {
          data.push(candle);
        }
      }
    }

    data.sort((a, b) => a.openTimeMs - b.openTimeMs);
    const usable = data.length > 0;
    const earliest = usable ? data[0].openTimeMs : null;
    const latest = usable ? data[data.length - 1].openTimeMs : null;

    return {
      success: usable,
      dataState: usable ? 'REAL' : 'UNAVAILABLE',
      coverage: {
        mode: 'REAL_HISTORICAL',
        earliestTimestampMs: earliest,
        latestTimestampMs: latest,
        requestedStartMs: startMs,
        requestedEndMs: endMs,
        complete: usable,
      },
      provenance: {
        space: 'datasource-4',
        endpoint: '/api/history',
        provider: 'space4_binance_vision',
        attempts: [{ provider: 'space4', ok: usable, status: res.status, latencyMs }],
        fetchedAtMs: Date.now(),
      },
      count: data.length,
      data,
    };
  }

  async getFunding(symbol: string, limit = 500): Promise<CanonicalEnvelope<CanonicalFundingRate[]>> {
    const cleanSymbol = sanitizeSymbol(symbol);
    const url = `${this.origin}/api/apex/funding/${cleanSymbol}?limit=${limit}`;
    const start = Date.now();
    const res = await smartFetchJson(url, {
      timeoutMs: 12000,
      logKey: 'space4_funding',
    });
    const latencyMs = Date.now() - start;

    const data: CanonicalFundingRate[] = [];
    if (res.ok && Array.isArray(res.json?.data)) {
      for (const row of res.json.data) {
        const rate = Number(row.fundingRate ?? row.rate ?? 0);
        const timeMs = normalizeEpochMs(row.fundingTime ?? row.timestamp ?? row.time);
        if (timeMs > 0 && Number.isFinite(rate)) {
          data.push({
            symbol: cleanSymbol,
            fundingRate: rate,
            fundingTimeMs: timeMs,
            source: String(res.json.source || 'space4_gateio_futures'),
          });
        }
      }
    }

    const usable = data.length > 0;
    return {
      success: usable,
      dataState: usable ? 'REAL' : 'UNAVAILABLE',
      coverage: {
        mode: 'REAL_RECENT_UPSTREAM',
        earliestTimestampMs: usable ? data[0].fundingTimeMs : null,
        latestTimestampMs: usable ? data[data.length - 1].fundingTimeMs : null,
        complete: usable,
      },
      provenance: {
        space: 'datasource-4',
        endpoint: `/api/apex/funding/${cleanSymbol}`,
        provider: String(res.json?.source || 'space4_gateio_futures'),
        attempts: [{ provider: 'space4', ok: usable, status: res.status, latencyMs }],
        fetchedAtMs: Date.now(),
      },
      count: data.length,
      data,
    };
  }

  async getOpenInterest(symbol: string, period = '1h', limit = 500): Promise<CanonicalEnvelope<CanonicalOpenInterest[]>> {
    const cleanSymbol = sanitizeSymbol(symbol);
    const url = `${this.origin}/api/apex/open-interest/${cleanSymbol}?period=${period}&limit=${limit}`;
    const start = Date.now();
    const res = await smartFetchJson(url, {
      timeoutMs: 12000,
      logKey: 'space4_oi',
    });
    const latencyMs = Date.now() - start;

    const data: CanonicalOpenInterest[] = [];
    if (res.ok && Array.isArray(res.json?.data)) {
      for (const row of res.json.data) {
        const oi = Number(row.openInterest ?? row.value ?? 0);
        const timeMs = normalizeEpochMs(row.timestamp ?? row.time);
        if (timeMs > 0 && Number.isFinite(oi)) {
          data.push({
            symbol: cleanSymbol,
            openInterest: oi,
            openInterestUsd: row.openInterestUsd ? Number(row.openInterestUsd) : undefined,
            timestampMs: timeMs,
            source: String(res.json.source || 'space4_oi'),
          });
        }
      }
    }

    const usable = data.length > 0;
    return {
      success: usable,
      dataState: usable ? 'REAL' : 'UNAVAILABLE',
      coverage: {
        mode: 'REAL_RECENT_PLUS_FORWARD_ARCHIVE',
        earliestTimestampMs: usable ? data[0].timestampMs : null,
        latestTimestampMs: usable ? data[data.length - 1].timestampMs : null,
        complete: usable,
      },
      provenance: {
        space: 'datasource-4',
        endpoint: `/api/apex/open-interest/${cleanSymbol}`,
        provider: String(res.json?.source || 'space4_oi'),
        attempts: [{ provider: 'space4', ok: usable, status: res.status, latencyMs }],
        fetchedAtMs: Date.now(),
      },
      count: data.length,
      data,
    };
  }

  async getFearGreed(limit = 0): Promise<CanonicalEnvelope<CanonicalFearGreed[]>> {
    const url = `${this.origin}/api/apex/sentiment/fear-greed?limit=${limit}`;
    const start = Date.now();
    const res = await smartFetchJson(url, {
      timeoutMs: 10000,
      logKey: 'space4_fear_greed',
    });
    const latencyMs = Date.now() - start;

    const data: CanonicalFearGreed[] = [];
    if (res.ok) {
      const rawRows = Array.isArray(res.json?.data) ? res.json.data : res.json?.value !== undefined ? [res.json] : [];
      for (const row of rawRows) {
        const val = Number(row.value ?? 0);
        const timeMs = normalizeEpochMs(row.timestamp ?? row.time ?? Date.now());
        if (Number.isFinite(val)) {
          data.push({
            value: val,
            classification: String(row.classification || row.value_classification || 'Neutral'),
            timestampMs: timeMs,
            source: 'Alternative.me (via Space 4)',
          });
        }
      }
    }

    const usable = data.length > 0;
    return {
      success: usable,
      dataState: usable ? 'REAL' : 'UNAVAILABLE',
      coverage: {
        mode: 'REAL_HISTORICAL',
        earliestTimestampMs: usable ? data[0].timestampMs : null,
        latestTimestampMs: usable ? data[data.length - 1].timestampMs : null,
        complete: usable,
      },
      provenance: {
        space: 'datasource-4',
        endpoint: '/api/apex/sentiment/fear-greed',
        provider: 'Alternative.me',
        attempts: [{ provider: 'space4', ok: usable, status: res.status, latencyMs }],
        fetchedAtMs: Date.now(),
      },
      count: data.length,
      data,
    };
  }

  async getNews(limit = 100): Promise<CanonicalEnvelope<CanonicalNewsEvent[]>> {
    const url = `${this.origin}/api/apex/news?limit=${limit}`;
    const start = Date.now();
    const res = await smartFetchJson(url, {
      timeoutMs: 10000,
      logKey: 'space4_news',
    });
    const latencyMs = Date.now() - start;

    const data: CanonicalNewsEvent[] = [];
    if (res.ok && Array.isArray(res.json?.data)) {
      for (const row of res.json.data) {
        const title = String(row.title || row.headline || '').trim();
        if (title) {
          data.push({
            provider: String(row.source || row.provider || 'HF Space 4'),
            providerId: String(row.id || row.guid || row.url || title),
            title,
            publishedAtMs: normalizeEpochMs(row.publishedAt || row.published_at || row.timestamp),
            ingestedAtMs: normalizeEpochMs(row.ingestedAt || Date.now()),
            url: row.url || undefined,
            symbols: Array.isArray(row.symbols) ? row.symbols : [],
          });
        }
      }
    }

    const usable = data.length > 0;
    return {
      success: usable,
      dataState: usable ? 'REAL' : 'UNAVAILABLE',
      coverage: {
        mode: 'FORWARD_COLLECTING_ONLY',
        earliestTimestampMs: usable ? data[0].publishedAtMs : null,
        latestTimestampMs: usable ? data[data.length - 1].publishedAtMs : null,
        complete: usable,
      },
      provenance: {
        space: 'datasource-4',
        endpoint: '/api/apex/news',
        provider: 'HF Space 4 News',
        attempts: [{ provider: 'space4', ok: usable, status: res.status, latencyMs }],
        fetchedAtMs: Date.now(),
      },
      count: data.length,
      data,
    };
  }

  async getWhaleFlow(limit = 100): Promise<CanonicalEnvelope<CanonicalWhaleFlow[]>> {
    const url = `${this.origin}/api/apex/whale-flow?limit=${limit}`;
    const start = Date.now();
    const res = await smartFetchJson(url, {
      timeoutMs: 10000,
      logKey: 'space4_whale_flow',
    });
    const latencyMs = Date.now() - start;

    const data: CanonicalWhaleFlow[] = [];
    if (res.ok && Array.isArray(res.json?.data)) {
      for (const row of res.json.data) {
        const hash = String(row.transactionHash || row.txHash || row.hash || '');
        if (hash) {
          data.push({
            chain: String(row.chain || 'ethereum'),
            transactionHash: hash,
            amount: Number(row.amount || 0),
            amountUsd: row.amountUsd ? Number(row.amountUsd) : undefined,
            timestampMs: normalizeEpochMs(row.timestamp || Date.now()),
            source: 'EVM Large Transfer Scanner (Space 4)',
          });
        }
      }
    }

    const usable = data.length > 0;
    return {
      success: usable,
      dataState: usable ? 'REAL' : 'UNAVAILABLE',
      coverage: {
        mode: 'FORWARD_COLLECTING_ONLY',
        earliestTimestampMs: usable ? data[0].timestampMs : null,
        latestTimestampMs: usable ? data[data.length - 1].timestampMs : null,
        complete: usable,
      },
      provenance: {
        space: 'datasource-4',
        endpoint: '/api/apex/whale-flow',
        provider: 'EVM Large Transfer Scanner',
        attempts: [{ provider: 'space4', ok: usable, status: res.status, latencyMs }],
        fetchedAtMs: Date.now(),
      },
      count: data.length,
      data,
    };
  }

  async getShortHunter(symbol: string, interval = '1h', limit = 120): Promise<CanonicalEnvelope<CanonicalShortHunterSnapshot>> {
    const cleanSymbol = sanitizeSymbol(symbol);
    // Short Hunter requires limit >= 30 per upstream contract
    const effectiveLimit = Math.max(30, limit);
    const url = `${this.origin}/api/short-hunter/snapshot/${cleanSymbol}?interval=${interval}&limit=${effectiveLimit}`;
    const start = Date.now();
    const res = await smartFetchJson(url, {
      timeoutMs: 12000,
      logKey: 'space4_short_hunter',
    });
    const latencyMs = Date.now() - start;

    const snapshot: CanonicalShortHunterSnapshot = {
      symbol: cleanSymbol,
      interval,
      sourceMode: 'LIVE',
      dataState: res.ok && res.json?.success ? 'REAL' : 'UNAVAILABLE',
      observedAtMs: Date.now(),
      replaySupported: false,
      metrics: res.ok && res.json ? res.json : {},
    };

    return {
      success: res.ok && res.json?.success === true,
      dataState: snapshot.dataState,
      coverage: {
        mode: 'LIVE_ONLY',
        earliestTimestampMs: snapshot.observedAtMs,
        latestTimestampMs: snapshot.observedAtMs,
        complete: true,
      },
      provenance: {
        space: 'datasource-4',
        endpoint: `/api/short-hunter/snapshot/${cleanSymbol}`,
        provider: 'Short Hunter Engine (Space 4)',
        attempts: [{ provider: 'space4', ok: res.ok, status: res.status, latencyMs }],
        fetchedAtMs: Date.now(),
      },
      count: 1,
      data: snapshot,
    };
  }
}
