import { apiMutate } from './apiMutate';

export type ExternalApiCategory = 'news' | 'sentiment' | 'onchain' | 'exchange' | 'webhook' | 'custom';
export type ExternalApiMethod = 'GET' | 'POST';
export type ExternalApiAuthType = 'none' | 'bearer' | 'apiKeyHeader' | 'apiKeyQuery' | 'customHeader';

export interface ExternalApiSource {
  id: string;
  enabled: boolean;
  category: ExternalApiCategory;
  name: string;
  baseUrl: string;
  method: ExternalApiMethod;
  authType: ExternalApiAuthType;
  authKeyName?: string;
  secret?: string;
  hasSecret?: boolean;
  parserHint?: string;
  notes?: string;
}

export function createExternalApiSource(category: ExternalApiCategory = 'news'): ExternalApiSource {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `src_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return {
    id,
    enabled: true,
    category,
    name: category === 'news' ? 'News feed' : category === 'sentiment' ? 'Sentiment feed' : 'Custom API',
    baseUrl: '',
    method: 'GET',
    authType: 'none',
    authKeyName: '',
    secret: '',
    parserHint: category,
    notes: '',
  };
}

export async function fetchExternalApiSources(): Promise<ExternalApiSource[]> {
  try {
    const res = await fetch('/api/external-sources/status');
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.sources) ? json.sources : [];
  } catch {
    return [];
  }
}

export async function saveExternalApiSources(sources: ExternalApiSource[]): Promise<{ ok: boolean; sources: ExternalApiSource[]; error?: string }> {
  try {
    const res = await apiMutate('/api/external-sources/config', {
      method: 'POST',
      body: JSON.stringify({ sources }),
    });
    if (!res.ok) return { ok: false, sources: [], error: `http_${res.status}` };
    const json = await res.json();
    return { ok: Boolean(json?.ok), sources: Array.isArray(json?.sources) ? json.sources : [] };
  } catch (e: any) {
    return { ok: false, sources: [], error: e?.message || 'request_failed' };
  }
}

export async function testExternalApiSource(id: string): Promise<{ ok: boolean; status?: number; latencyMs?: number; contentType?: string; error?: string }> {
  try {
    const res = await apiMutate('/api/external-sources/test', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    return await res.json();
  } catch (e: any) {
    return { ok: false, error: e?.message || 'request_failed' };
  }
}

/** Restore canonical keyless public/HF profiles into Custom APIs. */
export async function applyExternalApiDefaults(): Promise<{ ok: boolean; sources: ExternalApiSource[]; error?: string }> {
  try {
    const res = await apiMutate('/api/external-sources/config/defaults', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (!res.ok) return { ok: false, sources: [], error: `http_${res.status}` };
    const json = await res.json();
    return { ok: Boolean(json?.ok), sources: Array.isArray(json?.sources) ? json.sources : [] };
  } catch (e: any) {
    return { ok: false, sources: [], error: e?.message || 'request_failed' };
  }
}

