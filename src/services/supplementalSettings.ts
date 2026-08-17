import { apiMutate } from './apiMutate';
import { COMPLETED_SUPPLEMENTAL_DEFAULTS } from '../config/completedApiDefaults';
import {
  DEFAULT_NEWSAPI_QUERY,
  normalizeNewsApiQuery,
  type NewsApiQueryOptions,
} from './providers/newsApiRequest';

export type { NewsApiQueryOptions };

export interface SupplementalConfigStatus {
  newsApiKey: boolean;
  coinMarketCapKey: boolean;
  huggingFaceToken: boolean;
  etherscanKey: boolean;
  tronScanKey: boolean;
  bscScanKey: boolean;
}

export type SupplementalVerifiedStatus = SupplementalConfigStatus;

export interface SupplementalConfigInput {
  newsApiKey?: string;
  coinMarketCapKey?: string;
  huggingFaceToken?: string;
  etherscanKey?: string;
  tronScanKey?: string;
  bscScanKey?: string;
  newsApiQuery?: NewsApiQueryOptions;
}

export type SupplementalProbeKey = keyof SupplementalConfigStatus;

export interface SupplementalProbeResult {
  key: SupplementalProbeKey;
  ok: boolean;
  latencyMs: number;
  status: string;
  detail?: string;
}

export { COMPLETED_SUPPLEMENTAL_DEFAULTS };

const EMPTY_STATUS: SupplementalConfigStatus = {
  newsApiKey: false,
  coinMarketCapKey: false,
  huggingFaceToken: false,
  etherscanKey: false,
  tronScanKey: false,
  bscScanKey: false,
};

function verifiedFromStatusPayload(
  verified: Partial<SupplementalVerifiedStatus>,
  lastProbe?: Partial<Record<SupplementalProbeKey, SupplementalProbeResult>>,
): SupplementalVerifiedStatus {
  const out = { ...EMPTY_STATUS, ...verified };
  if (lastProbe) {
    for (const key of Object.keys(EMPTY_STATUS) as SupplementalProbeKey[]) {
      if (lastProbe[key]?.ok) out[key] = true;
    }
  }
  return out;
}

export async function fetchSupplementalConfigStatus(): Promise<{
  configured: SupplementalConfigStatus;
  verified: SupplementalVerifiedStatus;
  newsApiQuery: NewsApiQueryOptions;
  lastProbe: Partial<Record<SupplementalProbeKey, SupplementalProbeResult>>;
}> {
  try {
    const res = await fetch('/api/supplemental/config/status');
    if (!res.ok) {
      return { configured: EMPTY_STATUS, verified: { ...EMPTY_STATUS }, newsApiQuery: { ...DEFAULT_NEWSAPI_QUERY }, lastProbe: {} };
    }
    const json = await res.json();
    const lastProbe = json?.lastProbe ?? {};
    return {
      configured: { ...EMPTY_STATUS, ...(json?.configured ?? {}) },
      verified: verifiedFromStatusPayload(json?.verified ?? {}, lastProbe),
      newsApiQuery: normalizeNewsApiQuery(json?.newsApiQuery),
      lastProbe,
    };
  } catch {
    return { configured: EMPTY_STATUS, verified: { ...EMPTY_STATUS }, newsApiQuery: { ...DEFAULT_NEWSAPI_QUERY }, lastProbe: {} };
  }
}

export async function saveSupplementalConfig(input: SupplementalConfigInput): Promise<{
  ok: boolean;
  configured: SupplementalConfigStatus;
  verified: SupplementalVerifiedStatus;
  error?: string;
}> {
  try {
    const res = await apiMutate('/api/supplemental/config', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (!res.ok) return { ok: false, configured: EMPTY_STATUS, verified: { ...EMPTY_STATUS }, error: `http_${res.status}` };
    const json = await res.json();
    return {
      ok: Boolean(json?.ok),
      configured: { ...EMPTY_STATUS, ...(json?.configured ?? {}) },
      verified: { ...EMPTY_STATUS, ...(json?.verified ?? {}) },
    };
  } catch (e: any) {
    return { ok: false, configured: EMPTY_STATUS, verified: { ...EMPTY_STATUS }, error: e?.message || 'request_failed' };
  }
}

/** Restore Intelligence API keys to the completed Doc defaults. */
export async function applySupplementalDefaults(): Promise<{
  ok: boolean;
  configured: SupplementalConfigStatus;
  verified: SupplementalVerifiedStatus;
  error?: string;
}> {
  try {
    const res = await apiMutate('/api/supplemental/config/defaults', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (!res.ok) return { ok: false, configured: EMPTY_STATUS, verified: { ...EMPTY_STATUS }, error: `http_${res.status}` };
    const json = await res.json();
    return {
      ok: Boolean(json?.ok),
      configured: { ...EMPTY_STATUS, ...(json?.configured ?? {}) },
      verified: { ...EMPTY_STATUS, ...(json?.verified ?? {}) },
    };
  } catch (e: any) {
    return { ok: false, configured: EMPTY_STATUS, verified: { ...EMPTY_STATUS }, error: e?.message || 'request_failed' };
  }
}

/** Live-probe one key (or all stored keys when key omitted). */
export async function probeSupplementalKeys(key?: SupplementalProbeKey): Promise<{
  ok: boolean;
  results: Partial<Record<SupplementalProbeKey, SupplementalProbeResult>>;
  configured: SupplementalConfigStatus;
  verified: SupplementalVerifiedStatus;
  error?: string;
}> {
  try {
    const res = await apiMutate('/api/supplemental/config/probe', {
      method: 'POST',
      body: JSON.stringify(key ? { key } : {}),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      return {
        ok: false,
        results: {},
        configured: EMPTY_STATUS,
        verified: { ...EMPTY_STATUS },
        error: `http_${res.status}`,
      };
    }
    const json = await res.json();
    return {
      ok: Boolean(json?.ok),
      results: json?.results ?? {},
      configured: { ...EMPTY_STATUS, ...(json?.configured ?? {}) },
      verified: verifiedFromStatusPayload(json?.verified ?? {}, json?.results),
    };
  } catch (e: any) {
    return {
      ok: false,
      results: {},
      configured: EMPTY_STATUS,
      verified: { ...EMPTY_STATUS },
      error: e?.message || 'request_failed',
    };
  }
}
