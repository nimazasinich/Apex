import {
  CanonicalCandle,
  CanonicalEnvelope,
  CanonicalFearGreed,
  CanonicalFundingRate,
  normalizeEpochMs,
  validateCandleInvariants,
} from '../../contracts/datasource/hfDatasourceTypes';
import { smartFetchJson } from '../proxyFetch';

export const SPACE_2_ORIGIN =
  process.env.HF_SPACE_2_ORIGIN || 'https://really-amin-datasourceforcryptocurrency-2.hf.space';

function sanitizeSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/[-_/]/g, '');
}

export class Space2Adapter {
  constructor(private origin = SPACE_2_ORIGIN) {}

  async probe(): Promise<{ ok: boolean; latencyMs: number; status: number; error?: string }> {
    const start = Date.now();
    try {
      const res = await smartFetchJson(`${this.origin}/openapi.json`, {
        timeoutMs: 8000,
        logKey: 'space2_probe_openapi',
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

  async getOHLCV(
    symbol: string,
    timeframe = '1h',
    limit = 100,
    startMs?: number,
    endMs?: number,
  ): Promise<CanonicalEnvelope<CanonicalCandle[]>> {
    const cleanSymbol = sanitizeSymbol(symbol);
    const params = new URLSearchParams({
      symbol: cleanSymbol,
      timeframe,
      limit: String(limit),
    });
    if (startMs) params.set('start', String(startMs));
    if (endMs) params.set('end', String(endMs));

    const url = `${this.origin}/api/ohlcv?${params.toString()}`;
    const start = Date.now();
    const res = await smartFetchJson(url, {
      timeoutMs: 15000,
      logKey: 'space2_ohlcv',
    });
    const latencyMs = Date.now() - start;

    const data: CanonicalCandle[] = [];
    if (res.ok && Array.isArray(res.json?.data)) {
      for (const row of res.json.data) {
        const candle: CanonicalCandle = {
          symbol: cleanSymbol,
          interval: timeframe,
          openTimeMs: normalizeEpochMs(row.timestamp ?? row.openTime ?? row.time),
          closeTimeMs: normalizeEpochMs(row.closeTime),
          open: Number(row.open),
          high: Number(row.high),
          low: Number(row.low),
          close: Number(row.close),
          volume: Number(row.volume ?? 0),
          provider: 'space2_historical',
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
        space: 'datasource-2',
        endpoint: '/api/ohlcv',
        provider: 'space2_historical',
        attempts: [{ provider: 'space2', ok: usable, status: res.status, latencyMs }],
        fetchedAtMs: Date.now(),
      },
      count: data.length,
      data,
    };
  }

  async getFearGreed(limit = 0): Promise<CanonicalEnvelope<CanonicalFearGreed[]>> {
    const url = `${this.origin}/api/fear-greed?limit=${limit}`;
    const start = Date.now();
    const res = await smartFetchJson(url, {
      timeoutMs: 10000,
      logKey: 'space2_fear_greed',
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
            source: 'Alternative.me (via Space 2)',
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
        space: 'datasource-2',
        endpoint: '/api/fear-greed',
        provider: 'Alternative.me',
        attempts: [{ provider: 'space2', ok: usable, status: res.status, latencyMs }],
        fetchedAtMs: Date.now(),
      },
      count: data.length,
      data,
    };
  }

  async getMultiSourceSentiment(): Promise<CanonicalEnvelope<CanonicalFearGreed>> {
    const url = `${this.origin}/api/multi-source/sentiment`;
    const start = Date.now();
    const res = await smartFetchJson(url, {
      timeoutMs: 8000,
      logKey: 'space2_multi_source_sentiment',
    });
    const latencyMs = Date.now() - start;

    if (res.ok && res.json?.success === true && res.json.data) {
      const row = res.json.data;
      const val = Number(row.value ?? 0);
      const timeMs = normalizeEpochMs(row.timestamp ?? Date.now());
      const item: CanonicalFearGreed = {
        value: val,
        classification: String(row.classification || 'Neutral'),
        timestampMs: timeMs,
        source: String(res.json.source || 'alternative_me_fng'),
      };
      return {
        success: true,
        dataState: 'REAL',
        coverage: {
          mode: 'REAL_HISTORICAL',
          earliestTimestampMs: timeMs,
          latestTimestampMs: timeMs,
          complete: true,
        },
        provenance: {
          space: 'datasource-2',
          endpoint: '/api/multi-source/sentiment',
          provider: item.source,
          attempts: [{ provider: 'space2', ok: true, status: res.status, latencyMs }],
          fetchedAtMs: Date.now(),
        },
        count: 1,
        data: item,
      };
    }

    return {
      success: false,
      dataState: 'UNAVAILABLE',
      coverage: {
        mode: 'REAL_HISTORICAL',
        earliestTimestampMs: null,
        latestTimestampMs: null,
        complete: false,
      },
      provenance: {
        space: 'datasource-2',
        endpoint: '/api/multi-source/sentiment',
        provider: 'unknown',
        attempts: [{ provider: 'space2', ok: false, status: res.status, latencyMs }],
        fetchedAtMs: Date.now(),
      },
      count: 0,
      data: {
        value: 50,
        classification: 'Neutral',
        timestampMs: Date.now(),
        source: 'unavailable',
      },
    };
  }

  async getFunding(symbol: string, limit = 500): Promise<CanonicalEnvelope<CanonicalFundingRate[]>> {
    const cleanSymbol = sanitizeSymbol(symbol);
    const url = `${this.origin}/api/apex/funding/${cleanSymbol}?limit=${limit}`;
    const start = Date.now();
    const res = await smartFetchJson(url, {
      timeoutMs: 12000,
      logKey: 'space2_funding',
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
            source: String(res.json.source || 'space2_funding'),
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
        space: 'datasource-2',
        endpoint: `/api/apex/funding/${cleanSymbol}`,
        provider: String(res.json?.source || 'space2_funding'),
        attempts: [{ provider: 'space2', ok: usable, status: res.status, latencyMs }],
        fetchedAtMs: Date.now(),
      },
      count: data.length,
      data,
    };
  }
}
