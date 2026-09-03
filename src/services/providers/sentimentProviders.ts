/* Copied from apex-trading-engine/src/services/providers/sentimentProviders.ts */

import {
  SupplementalProvider,
  ProviderConfig,
  SentimentResult,
  SupplementalDataSource,
  SentimentScore,
  SupplementalFetchContext,
} from './supplementalTypes';
import { describeUpstreamUnreachable, smartFetchJson } from '../proxyFetch';

const MAX_CLASSIFIED_HEADLINES = 12;

function readTopLabels(json: unknown): Array<{ value: number; confidence: number }> {
  if (!Array.isArray(json)) return [];
  const rows = json.map((entry) => (Array.isArray(entry) ? entry[0] : entry));
  const out: Array<{ value: number; confidence: number }> = [];
  for (const row of rows) {
    const label = String((row as any)?.label ?? '').toLowerCase();
    const score = Number((row as any)?.score);
    if (!label || !Number.isFinite(score)) continue;
    if (label.startsWith('pos')) out.push({ value: score, confidence: score });
    else if (label.startsWith('neg')) out.push({ value: -score, confidence: score });
    else out.push({ value: 0, confidence: score });
  }
  return out;
}

export class HuggingFaceSentimentProvider implements SupplementalProvider {
  name = 'HuggingFace';
  category = 'sentiment' as const;
  private apiKey: string | undefined;
  private timeout: number;
  private modelId = 'ProsusAI/finbert';

  constructor(config?: ProviderConfig) {
    this.apiKey = config?.apiKey;
    this.timeout = config?.timeout || 8000;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async fetch(
    symbol: string,
    timeoutMs?: number,
    context?: SupplementalFetchContext,
  ): Promise<SentimentResult> {
    const startTime = Date.now();
    const tmo = timeoutMs || this.timeout;

    if (!this.isConfigured()) {
      return {
        category: 'sentiment',
        valid: false,
        provider: this.name,
        symbol,
        data: null,
        source: 'not_configured',
        status: 'NOT_CONFIGURED',
        reason: 'Hugging Face token not set',
        latencyMs: 0,
        updatedAt: new Date().toISOString(),
      };
    }

    const corpus = (context?.headlines ?? [])
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, MAX_CLASSIFIED_HEADLINES);

    if (corpus.length === 0) {
      return {
        category: 'sentiment',
        valid: false,
        provider: this.name,
        symbol,
        data: null,
        source: 'unavailable',
        status: 'NO_CORPUS',
        reason: 'No live headlines to classify — configure the NewsAPI key to enable model sentiment',
        latencyMs: Date.now() - startTime,
        updatedAt: new Date().toISOString(),
      };
    }

    try {
      const url = `https://router.huggingface.co/hf-inference/models/${this.modelId}`;

      const response = await smartFetchJson(url, {
        method: 'POST',
        timeoutMs: tmo,
        logKey: 'huggingface:sentiment',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: corpus, parameters: { top_k: 1 } }),
      });
      const latency = Date.now() - startTime;

      if (response.status === 401) {
        return {
          category: 'sentiment',
        valid: false,
          provider: this.name,
          symbol,
          data: null,
          source: 'unavailable',
          status: 'UNAUTHORIZED',
          reason: 'Hugging Face token is invalid',
          latencyMs: latency,
          updatedAt: new Date().toISOString(),
        };
      }

      if (response.status === 429) {
        return {
          category: 'sentiment',
        valid: false,
          provider: this.name,
          symbol,
          data: null,
          source: 'degraded',
          status: 'RATE_LIMITED',
          reason: 'Hugging Face rate limit exceeded',
          latencyMs: latency,
          updatedAt: new Date().toISOString(),
        };
      }

      if (!response.ok) {
        const unreachable = response.status === 0;
        return {
          category: 'sentiment',
        valid: false,
          provider: this.name,
          symbol,
          data: null,
          source: 'unavailable',
          status: unreachable ? 'UNREACHABLE' : `HTTP_${response.status}`,
          reason: unreachable
            ? describeUpstreamUnreachable('router.huggingface.co', response.error)
            : `Hugging Face returned HTTP ${response.status}`,
          latencyMs: latency,
          updatedAt: new Date().toISOString(),
        };
      }

      const perHeadline = readTopLabels(response.json);

      if (perHeadline.length !== corpus.length) {
        return {
          category: 'sentiment',
        valid: false,
          provider: this.name,
          symbol,
          data: null,
          source: 'unavailable',
          status: 'BAD_RESPONSE',
          reason: `Hugging Face returned ${perHeadline.length} classifications for ${corpus.length} headlines`,
          latencyMs: latency,
          updatedAt: new Date().toISOString(),
        };
      }

      const value = perHeadline.reduce((sum, e) => sum + e.value, 0) / perHeadline.length;
      const confidence = perHeadline.reduce((sum, e) => sum + e.confidence, 0) / perHeadline.length;

      const score: SentimentScore = {
        value: Math.max(-1, Math.min(1, value)),
        label: value > 0.15 ? 'POSITIVE' : value < -0.15 ? 'NEGATIVE' : 'NEUTRAL',
        confidence,
        modelVersion: this.modelId,
      };

      return {
        category: 'sentiment',
        valid: true,
        provider: this.name,
        symbol,
        data: score,
        newsContext: corpus,
        source: 'live',
        status: 'OK',
        latencyMs: latency,
        updatedAt: new Date().toISOString(),
      };
    } catch (err) {
      const latency = Date.now() - startTime;
      const reason =
        err instanceof Error
          ? err.message.includes('abort')
            ? 'Request timeout'
            : err.message
          : 'Unknown error';

      return {
        category: 'sentiment',
        valid: false,
        provider: this.name,
        symbol,
        data: null,
        source: 'unavailable',
        status: 'FETCH_FAILED',
        reason,
        latencyMs: latency,
        updatedAt: new Date().toISOString(),
      };
    }
  }
}

export class AlternativeMeSentimentProvider implements SupplementalProvider {
  name = 'AlternativeMeFearGreed';
  category = 'sentiment' as const;
  private timeout: number;

  constructor(config?: ProviderConfig) {
    this.timeout = config?.timeout || 8000;
  }

  isConfigured(): boolean {
    return true;
  }

  async fetch(symbol: string, timeoutMs?: number): Promise<SentimentResult> {
    const startTime = Date.now();
    const tmo = timeoutMs || this.timeout;
    try {
      const response = await smartFetchJson('https://api.alternative.me/fng/?limit=1', {
        timeoutMs: tmo,
        logKey: 'alternativeme:fng',
      });
      const latency = Date.now() - startTime;

      let json = response.json;
      let row = json?.data?.[0];
      let raw = Number(row?.value);

      if (!response.ok || !Number.isFinite(raw)) {
        // Multi-source fallback to Space 2
        try {
          const fallbackRes = await smartFetchJson('https://really-amin-datasourceforcryptocurrency-2.hf.space/api/multi-source/sentiment', {
            timeoutMs: tmo,
            logKey: 'alternativeme:fng_fallback_space2',
          });
          if (fallbackRes.ok && fallbackRes.json?.success === true && fallbackRes.json.data) {
            json = fallbackRes.json;
            row = fallbackRes.json.data;
            raw = Number(row?.value);
          }
        } catch {
          // fallback failed, continue to standard error handling
        }
      }

      if (!Number.isFinite(raw)) {
        if (response.status === 429) {
          return {
            category: 'sentiment',
            valid: false,
            provider: this.name,
            symbol,
            data: null,
            source: 'degraded',
            status: 'RATE_LIMITED',
            reason: 'Alternative.me rate limit exceeded',
            latencyMs: latency,
            updatedAt: new Date().toISOString(),
          };
        }
        const unreachable = response.status === 0;
        return {
          category: 'sentiment',
          valid: false,
          provider: this.name,
          symbol,
          data: null,
          source: 'unavailable',
          status: unreachable ? 'UNREACHABLE' : `HTTP_${response.status}`,
          reason: unreachable
            ? describeUpstreamUnreachable('api.alternative.me', response.error)
            : `Alternative.me returned HTTP ${response.status}`,
          latencyMs: latency,
          updatedAt: new Date().toISOString(),
        };
      }

      const value = Math.max(-1, Math.min(1, (raw - 50) / 50));
      const label: SentimentScore['label'] =
        value > 0.15 ? 'POSITIVE' : value < -0.15 ? 'NEGATIVE' : 'NEUTRAL';

      return {
        category: 'sentiment',
        valid: true,
        provider: this.name,
        symbol,
        data: {
          value,
          label,
          confidence: 0.6,
          modelVersion: 'alternative.me-fng-v1',
        },
        source: 'live',
        status: 'OK',
        latencyMs: latency,
        updatedAt: new Date().toISOString(),
      };
    } catch (err) {
      const latency = Date.now() - startTime;
      const reason =
        err instanceof Error
          ? err.message.includes('abort')
            ? 'Request timeout'
            : err.message
          : 'Unknown error';
      return {
        category: 'sentiment',
        valid: false,
        provider: this.name,
        symbol,
        data: null,
        source: 'unavailable',
        status: 'FETCH_FAILED',
        reason,
        latencyMs: latency,
        updatedAt: new Date().toISOString(),
      };
    }
  }
}

