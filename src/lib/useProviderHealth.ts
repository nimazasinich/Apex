import { useMemo } from 'react';
import type { OperationsProviderRow } from '../services/operationsStatus';
import type { DataState, SystemHealthReport } from '../types';
import { formatCheckAge, providerCheckAgeMs, providerRowState } from '../components/overview/overviewModel';
import type { CapabilityHealthObservation, RuntimeProviderCapabilityHealth } from '../contracts/providerCapabilityHealth';
import { useOverviewDiagnostics } from './useOverviewDiagnostics';

export type ProviderDisplayRow = {
  key: string;
  name: string;
  source: string;
  category: 'Market Data' | 'News' | 'Sentiment' | 'On-chain' | 'Capability' | 'Other';
  state: string;
  latency: string;
  latencyMs: number | null;
  checkAge: string;
  checkAgeMs: number | null;
  tone: 'ok' | 'warn' | 'muted' | 'danger';
  title?: string;
};

export function systemProvider(
  name: string,
  source: string,
  state: DataState | undefined,
  pending = false,
  latencyMs?: number | null,
  route?: string | null,
  checkedAt?: number | null,
): ProviderDisplayRow {
  const latency = Number.isFinite(latencyMs) ? `${Math.round(Number(latencyMs))} ms` : '—';
  const title = route ? `Health route: ${route}` : undefined;
  const ageMs = Number.isFinite(checkedAt) ? Math.max(0, Date.now() - Number(checkedAt)) : null;
  const checkAge = ageMs != null ? formatCheckAge(ageMs) : '—';
  const category: ProviderDisplayRow['category'] = name.toLowerCase().includes('sentiment') ? 'Sentiment' : 'Market Data';

  if (state == null && pending) {
    return {
      key: `system:${name}`,
      name,
      source,
      category,
      state: 'CHECKING',
      latency: '—',
      latencyMs: null,
      checkAge: '—',
      checkAgeMs: null,
      tone: 'muted',
    };
  }
  const normalized = state ?? 'unavailable';
  if (normalized === 'live') {
    return { key: `system:${name}`, name, source, category, state: 'OK', latency, latencyMs: latencyMs ?? null, checkAge, checkAgeMs: ageMs, tone: 'ok', title };
  }
  if (normalized === 'degraded') {
    return { key: `system:${name}`, name, source, category, state: 'DEGRADED', latency, latencyMs: latencyMs ?? null, checkAge, checkAgeMs: ageMs, tone: 'warn', title };
  }
  if (normalized === 'not_configured') {
    return { key: `system:${name}`, name, source, category, state: 'NOT SET', latency: '—', latencyMs: null, checkAge: '—', checkAgeMs: null, tone: 'muted', title };
  }
  return { key: `system:${name}`, name, source, category, state: 'UNAVAILABLE', latency, latencyMs: latencyMs ?? null, checkAge, checkAgeMs: ageMs, tone: 'warn', title };
}

export function activeMarketProviderRow(source: string, state: DataState, observedAt: number | null): ProviderDisplayRow {
  const provider = capabilityLabel(source);
  const ageMs = observedAt == null ? null : Math.max(0, Date.now() - observedAt);
  return {
    key: `active-market:${source}`,
    name: `Active universe · ${provider}`,
    source: 'Actual dashboard feed',
    category: 'Market Data',
    state: state === 'live' ? 'OK' : state === 'degraded' ? 'DEGRADED' : 'UNAVAILABLE',
    latency: '—',
    latencyMs: null,
    checkAge: ageMs == null ? '—' : formatCheckAge(ageMs),
    checkAgeMs: ageMs,
    tone: state === 'live' ? 'ok' : state === 'unavailable' ? 'danger' : 'warn',
    title: observedAt == null
      ? `The current /api/market/top-volume response selected ${source}; provider observation time was unavailable.`
      : `Actually selected by /api/market/top-volume; newest provider observation ${new Date(observedAt).toISOString()}`,
  };
}

export function sourceCategory(category: string): ProviderDisplayRow['category'] {
  const normalized = category.toLowerCase();
  if (normalized.includes('onchain') || normalized.includes('on-chain')) return 'On-chain';
  if (normalized.includes('news')) return 'News';
  if (normalized.includes('sentiment')) return 'Sentiment';
  if (normalized.includes('market')) return 'Market Data';
  return 'Other';
}

export function sourceLabel(category: string): string {
  const normalized = category.toLowerCase();
  if (normalized.includes('onchain') || normalized.includes('on-chain')) return 'On-chain';
  if (normalized.includes('news')) return 'News';
  if (normalized.includes('sentiment')) return 'Sentiment';
  if (normalized.includes('market')) return 'Market Data';
  return category.replace(/_/g, ' ');
}

export function supplementalProvider(row: OperationsProviderRow): ProviderDisplayRow {
  const state = row.isConfigured && row.reasonCode === 'SCHEMA_INVALID' ? 'SCHEMA' : providerRowState(row);
  const tone: ProviderDisplayRow['tone'] = state === 'SCHEMA'
    ? 'danger'
    : state === 'OK'
      ? 'ok'
      : ['NOT SET', 'NEVER PROBED', 'CHECKING'].includes(state)
        ? 'muted'
        : 'warn';
  const ageMs = providerCheckAgeMs(row);
  return {
    key: `supplemental:${row.name}`,
    name: row.name,
    source: sourceLabel(row.category),
    category: sourceCategory(row.category),
    state,
    latency: '—',
    latencyMs: null,
    checkAge: formatCheckAge(ageMs),
    checkAgeMs: ageMs,
    tone,
    title: row.reason ?? undefined,
  };
}

export function capabilityLabel(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function runtimeCapabilityRow(
  provider: RuntimeProviderCapabilityHealth['provider'],
  capability: string,
  observation: CapabilityHealthObservation,
  now = Date.now(),
): ProviderDisplayRow {
  const tone: ProviderDisplayRow['tone'] = observation.state === 'OK'
    ? 'ok'
    : observation.state === 'FAIL'
      ? 'danger'
      : observation.state === 'DEGRADED'
        ? 'warn'
        : 'muted';
  const observedAt = observation.observedAt;
  const ageMs = observedAt == null ? null : Math.max(0, now - observedAt);
  const state = observation.state === 'NEVER_PROBED' ? 'UNPROBED' : observation.state;
  return {
    key: `capability:${provider}:${capability}`,
    name: `${capabilityLabel(provider)} · ${capabilityLabel(capability)}`,
    source: 'Capability',
    category: 'Capability',
    state,
    latency: '—',
    latencyMs: null,
    checkAge: ageMs == null ? '—' : formatCheckAge(ageMs),
    checkAgeMs: ageMs,
    tone,
    title: observation.reason || (observedAt == null ? 'Capability has no runtime observation.' : `Observed ${new Date(observedAt).toISOString()}`),
  };
}

const PRIORITY = [
  'binance',
  'kucoin',
  'hf space 4',
  'space 4',
  'hf space 2',
  'space 2',
  'alternative.me',
  'sentiment feed',
  'newsapi',
  'coinmarketcap',
  'huggingface',
  'etherscan',
  'bscscan',
  'tronscan',
  'news',
  'whale',
  'onchain',
];

function rankRow(row: ProviderDisplayRow): number {
  const name = row.name.toLowerCase();
  const index = PRIORITY.findIndex((needle) => name.includes(needle));
  return index === -1 ? 100 : index;
}

export function buildProviderDisplayRows({
  providers,
  health,
  loading = false,
  activeMarketSource = null,
  marketDataState = 'unavailable',
  marketObservedAt = null,
  includeCapabilities = true,
}: {
  providers: OperationsProviderRow[];
  health: SystemHealthReport | null;
  loading?: boolean;
  activeMarketSource?: string | null;
  marketDataState?: DataState;
  marketObservedAt?: number | null;
  includeCapabilities?: boolean;
}): ProviderDisplayRow[] {
  const isDuplicateMarketSource = activeMarketSource && ['binance', 'kucoin'].includes(activeMarketSource.toLowerCase());
  const primary: ProviderDisplayRow[] = [
    ...(activeMarketSource && !isDuplicateMarketSource ? [activeMarketProviderRow(activeMarketSource, marketDataState, marketObservedAt)] : []),
    systemProvider('Binance', 'Independent live probe', health?.binanceStatus, loading, health?.binanceLatencyMs, health?.binanceRoute, health?.checkedAt),
    systemProvider('KuCoin', 'Independent live probe', health?.kucoinStatus, loading, health?.kucoinLatencyMs, health?.kucoinRoute, health?.checkedAt),
    systemProvider('Sentiment Feed', 'Configuration state', health?.sentimentStatus, loading, undefined, undefined, health?.checkedAt),
  ];
  const capabilities = includeCapabilities ? (health?.providerCapabilities ?? []).flatMap((provider) =>
    Object.entries(provider.capabilities).map(([capability, observation]) =>
      runtimeCapabilityRow(provider.provider, capability, observation),
    ),
  ) : [];
  const supplemental = providers.map(supplementalProvider);
  const deduped = new Map<string, ProviderDisplayRow>();
  [...primary, ...supplemental, ...capabilities].forEach((row) => {
    const normalized = row.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!deduped.has(normalized)) deduped.set(normalized, row);
  });
  return [...deduped.values()].sort((a, b) => rankRow(a) - rankRow(b) || a.name.localeCompare(b.name));
}

export function useProviderHealth(enabled = true) {
  const { snapshot, loading, error, refresh } = useOverviewDiagnostics(enabled);
  const providers = snapshot?.operations.data?.providers.items ?? [];
  const health = snapshot?.health.data ?? null;

  const rows = useMemo(() => {
    return buildProviderDisplayRows({
      providers,
      health,
      loading,
    });
  }, [providers, health, loading]);

  const summary = useMemo(() => {
    const ok = rows.filter((r) => r.tone === 'ok').length;
    const warn = rows.filter((r) => r.tone === 'warn').length;
    const danger = rows.filter((r) => r.tone === 'danger').length;
    const muted = rows.filter((r) => r.tone === 'muted').length;
    return {
      total: rows.length,
      healthy: ok,
      degraded: warn,
      unavailable: danger + muted,
    };
  }, [rows]);

  return {
    rows,
    summary,
    loading,
    error: error || snapshot?.health.error || snapshot?.operations.error || null,
    refresh,
    lastChecked: snapshot?.health.data?.checkedAt ?? snapshot?.generatedAt ?? null,
  };
}
