import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Coins,
  DatabaseZap,
  FlaskConical,
  KeyRound,
  Loader2,
  Newspaper,
  Plus,
  RotateCcw,
  Save,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Trash2,
  WalletCards,
} from 'lucide-react';
import {
  applyExternalApiDefaults,
  createExternalApiSource,
  fetchExternalApiSources,
  saveExternalApiSources,
  testExternalApiSource,
  type ExternalApiSource,
} from '../services/externalApiSources';
import {
  applySupplementalDefaults,
  fetchSupplementalConfigStatus,
  probeSupplementalKeys,
  saveSupplementalConfig,
  type NewsApiQueryOptions,
  type SupplementalConfigInput,
  type SupplementalConfigStatus,
  type SupplementalProbeKey,
  type SupplementalProbeResult,
  type SupplementalVerifiedStatus,
} from '../services/supplementalSettings';
import { Panel, PanelHeader, StatusBadge } from './ui/WorkspacePrimitives';
import { fetchJsonWithTimeout } from '../services/apiQuery';
import type { IntegrationHealthEntry } from '../services/integrationHealthHistory';

const EMPTY_STATUS: SupplementalConfigStatus = {
  newsApiKey: false,
  coinMarketCapKey: false,
  huggingFaceToken: false,
  etherscanKey: false,
  tronScanKey: false,
  bscScanKey: false,
};

const KEY_ROWS: Array<{
  key: SupplementalProbeKey;
  label: string;
  detail: string;
  placeholder: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
}> = [
  { key: 'newsApiKey', label: 'Newsdata.io', detail: 'Headline intelligence', placeholder: 'Write-only Newsdata.io key', icon: Newspaper },
  { key: 'coinMarketCapKey', label: 'CoinMarketCap', detail: 'Final market fallback · operator key', placeholder: 'Enter CoinMarketCap key', icon: Coins },
  { key: 'huggingFaceToken', label: 'Hugging Face', detail: 'Private Space access', placeholder: 'Write-only access token', icon: Sparkles },
  { key: 'etherscanKey', label: 'Etherscan', detail: 'Ethereum on-chain data', placeholder: 'Write-only Etherscan key', icon: ShieldCheck },
  { key: 'tronScanKey', label: 'TronScan', detail: 'TRON on-chain data', placeholder: 'Write-only TronScan key', icon: WalletCards },
  { key: 'bscScanKey', label: 'BscScan (BNB Chain)', detail: 'On-chain wallet/whale data for BNB Smart Chain — not the Binance exchange. Uses Etherscan V2 (chain 56).', placeholder: 'Write-only BscScan key', icon: ServerCog },
];

const STORED_SECRET_MARKER = 'Stored server-side';

function formatProbeSummary(result: SupplementalProbeResult): string {
  return `${result.status} · ${result.latencyMs} ms`;
}

function formatProbeTooltip(result: SupplementalProbeResult): string {
  return result.detail ? `${formatProbeSummary(result)} · ${result.detail}` : formatProbeSummary(result);
}

interface FeedHealth {
  ok: boolean;
  fetchedAt?: string;
  fearGreed?: { ok: boolean; status: string; detail?: string };
  market?: { ok: boolean; status: string; source?: string; detail?: string };
  ethOracle?: { ok: boolean; status: string; detail?: string };
  news?: { ok: boolean; status: string; source?: string; headlines?: unknown[]; detail?: string };
  whales?: { ok: boolean; status: string; source?: string; count?: number; detail?: string };
  [key: string]: unknown;
}

function statusTone(configured: boolean, verified: boolean): 'positive' | 'warning' | 'neutral' {
  if (verified) return 'positive';
  return configured ? 'warning' : 'neutral';
}

function statusLabel(configured: boolean, verified: boolean): string {
  if (verified) return 'Live verified';
  return configured ? 'Stored · test needed' : 'Not configured';
}

function providerCardState(configured: boolean, verified: boolean): string {
  if (verified) return 'is-verified';
  return configured ? 'is-stored' : 'is-empty';
}

function hasLivePass(verified: boolean | undefined, result?: SupplementalProbeResult): boolean {
  return Boolean(verified || result?.ok);
}

export function IntelligenceSourcesSettingsPanel({ onMessage }: { onMessage?: (message: string) => void }) {
  const [configured, setConfigured] = useState<SupplementalConfigStatus>(EMPTY_STATUS);
  const [verified, setVerified] = useState<SupplementalVerifiedStatus>(EMPTY_STATUS);
  const [keyCounts, setKeyCounts] = useState<Partial<Record<SupplementalProbeKey, number>>>({});
  const [defaultPackLoaded, setDefaultPackLoaded] = useState(false);
  const [defaultPackSource, setDefaultPackSource] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<SupplementalConfigInput>({});
  const [newsApiQuery, setNewsApiQuery] = useState<NewsApiQueryOptions>({});
  const [probeResults, setProbeResults] = useState<Partial<Record<SupplementalProbeKey, SupplementalProbeResult>>>({});
  const [sources, setSources] = useState<ExternalApiSource[]>([]);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [customProfilesOpen, setCustomProfilesOpen] = useState(false);
  const [sourceTests, setSourceTests] = useState<Record<string, { ok: boolean; status?: number; latencyMs?: number; error?: string }>>({});
  const [feedHealth, setFeedHealth] = useState<FeedHealth | null>(null);
  const [probeHistory, setProbeHistory] = useState<IntegrationHealthEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKeys, setSavingKeys] = useState(false);
  const [probingKey, setProbingKey] = useState<SupplementalProbeKey | 'all' | null>(null);
  const [savingSources, setSavingSources] = useState(false);
  const [testingSource, setTestingSource] = useState<string | null>(null);

  const emit = useCallback((message: string) => onMessage?.(message), [onMessage]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const statusTask = fetchSupplementalConfigStatus()
      .then((status) => {
        setConfigured(status.configured);
        setVerified(status.verified);
        setKeyCounts(status.keyCounts);
        setDefaultPackLoaded(status.defaultPackLoaded);
        setDefaultPackSource(status.defaultPackSource);
        setNewsApiQuery(status.newsApiQuery);
        setProbeResults(status.lastProbe);
        setProbeHistory(status.probeHistory);
      });
    const sourcesTask = fetchExternalApiSources().then(setSources);
    const feedTask = fetchJsonWithTimeout<FeedHealth>('/api/intelligence/feeds', { timeoutMs: 10_000 })
      .then(setFeedHealth)
      .catch(() => setFeedHealth({ ok: false }));
    await Promise.allSettled([statusTask, sourcesTask, feedTask]);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const configuredCount = useMemo(() => Object.values(configured).filter(Boolean).length, [configured]);
  const verifiedCount = useMemo(() => Object.values(verified).filter(Boolean).length, [verified]);
  const activeSources = useMemo(() => sources.filter((source) => source.enabled).length, [sources]);
  const totalStoredKeys = useMemo(() => Object.values(keyCounts).reduce((sum, value) => sum + (Number(value) || 0), 0), [keyCounts]);

  const restoreAttachedPack = async () => {
    setSavingKeys(true);
    const [keysResult, sourcesResult] = await Promise.all([
      applySupplementalDefaults(),
      applyExternalApiDefaults(),
    ]);
    setSavingKeys(false);
    if (!keysResult.ok) {
      emit(`Attached API pack could not be restored: ${keysResult.error || 'request failed'}.`);
      return;
    }
    setConfigured(keysResult.configured);
    setVerified(keysResult.verified);
    if (sourcesResult.ok) setSources(sourcesResult.sources);
    await refresh();
    emit('Attached API pack restored server-side. Smart routing will use primary and reserve credentials without exposing secrets to the browser.');
  };

  const saveKeys = async () => {
    setSavingKeys(true);
    const payload: SupplementalConfigInput = { newsApiQuery };
    for (const { key } of KEY_ROWS) {
      const value = secrets[key];
      if (typeof value === 'string' && value.trim() && value.trim() !== STORED_SECRET_MARKER) payload[key] = value.trim();
    }
    const result = await saveSupplementalConfig(payload);
    setSavingKeys(false);
    if (!result.ok) {
      emit(`Intelligence API settings were not saved: ${result.error || 'request failed'}.`);
      return;
    }
    setConfigured(result.configured);
    setVerified(result.verified);
    setSecrets({});
    emit('Intelligence API settings saved. Stored credentials remain write-only and are shown as safe markers.');
  };

  const probe = async (key?: SupplementalProbeKey) => {
    setProbingKey(key || 'all');
    const result = await probeSupplementalKeys(key);
    setProbingKey(null);
    if (!result.ok) {
      emit(`Provider verification failed: ${result.error || 'request failed'}.`);
      return;
    }
    setConfigured(result.configured);
    const nextVerified: SupplementalVerifiedStatus = { ...result.verified };
    for (const [resultKey, rowResult] of Object.entries(result.results) as [SupplementalProbeKey, SupplementalProbeResult][]) {
      if (rowResult?.ok) nextVerified[resultKey] = true;
    }
    setVerified(nextVerified);
    setProbeResults((current) => ({ ...current, ...result.results }));
    if (result.history?.length) setProbeHistory(result.history);
    const passes = Object.values(result.results).filter((row) => row?.ok).length;
    emit(`${passes} intelligence provider${passes === 1 ? '' : 's'} verified against live upstream endpoints.`);
  };

  const updateSource = (id: string, patch: Partial<ExternalApiSource>) => {
    setSources((current) => current.map((source) => source.id === id ? { ...source, ...patch } : source));
  };

  const addSource = () => {
    const source = createExternalApiSource('news');
    setSources((current) => [...current, source]);
    setExpandedSource(source.id);
  };

  const removeSource = (id: string) => {
    setSources((current) => current.filter((source) => source.id !== id));
    setExpandedSource((current) => current === id ? null : current);
  };

  const persistSources = async () => {
    setSavingSources(true);
    const result = await saveExternalApiSources(sources);
    setSavingSources(false);
    if (!result.ok) {
      emit(`Custom API profiles were not saved: ${result.error || 'request failed'}.`);
      return;
    }
    setSources(result.sources);
    emit('Custom API profiles saved server-side. Stored secrets remain write-only.');
  };

  const restoreProfiles = async () => {
    setSavingSources(true);
    const result = await applyExternalApiDefaults();
    setSavingSources(false);
    if (!result.ok) {
      emit(`Default source profiles were not restored: ${result.error || 'request failed'}.`);
      return;
    }
    setSources(result.sources);
    emit('Verified project source profiles restored without replacing your unrelated profiles.');
  };

  const testSource = async (source: ExternalApiSource) => {
    if (!source.baseUrl.trim()) {
      emit('Enter and save a source URL before testing it.');
      return;
    }
    // Persist first so the server test uses the current write-only secret and URL.
    setTestingSource(source.id);
    const saved = await saveExternalApiSources(sources);
    if (!saved.ok) {
      setTestingSource(null);
      emit(`Source could not be tested because saving failed: ${saved.error || 'request failed'}.`);
      return;
    }
    setSources(saved.sources);
    const result = await testExternalApiSource(source.id);
    setTestingSource(null);
    setSourceTests((current) => ({ ...current, [source.id]: result }));
    emit(result.ok
      ? `${source.name} responded successfully in ${result.latencyMs ?? '—'} ms.`
      : `${source.name} test failed: ${result.error || `HTTP ${result.status || 'unknown'}`}.`);
  };

  return (
    <div className="apex-v3-integration-stack">
      <Panel className="settings-integration-card intelligence-overview-card">
        <PanelHeader
          title="Intelligence sources"
          subtitle="Server-side smart provider routing for market context, news, sentiment and on-chain evidence"
          action={(
            <div className="apex-v3-profile-panel-actions">
              <StatusBadge tone={defaultPackLoaded ? 'positive' : 'warning'}>{defaultPackLoaded ? 'Attached pack loaded' : 'Private pack missing'}</StatusBadge>
              <button type="button" className="apex-v3-button secondary compact" disabled={savingKeys} onClick={() => void restoreAttachedPack()}><RotateCcw size={13} /> Restore API pack</button>
            </div>
          )}
        />
        {!defaultPackLoaded && (
          <div className="apex-v3-security-banner" style={{ background: 'color-mix(in srgb, var(--apex-orange-500, #f59e0b) 12%, var(--apex-surface, #fff))', borderColor: 'color-mix(in srgb, var(--apex-orange-500, #f59e0b) 35%, var(--apex-border))', marginBottom: '12px' }}>
            <CircleAlert size={18} style={{ color: 'var(--apex-orange-500, #f59e0b)', flexShrink: 0 }} />
            <span>
              <strong>No private API seed found</strong>
              <small>All supplemental providers will show Not configured until <code>.apex-private-seed/api-provider-seed.json</code> is populated or keys are configured.</small>
            </span>
          </div>
        )}
        <div className="apex-v3-integration-summary">
          <div><KeyRound size={17} /><span><strong>{configuredCount}/6</strong><small>Provider families configured</small></span></div>
          <div><CheckCircle2 size={17} /><span><strong>{verifiedCount}/6</strong><small>Live verified</small></span></div>
          <div><ServerCog size={17} /><span><strong>{totalStoredKeys}</strong><small>Primary + reserve keys</small></span></div>
          <div><Activity size={17} /><span><strong>{activeSources}</strong><small>Active public profiles</small></span></div>
        </div>
        <p className="apex-v3-form-note">{defaultPackLoaded ? `Default pack: ${defaultPackSource || 'attached configuration'} · ` : ''}Secrets remain server-side/write-only. Smart routing tries direct providers first, then bounded provider/key fallbacks; stored values are never returned to the browser.</p>
      </Panel>

      <Panel className="settings-integration-card apex-v3-feed-runtime-card">
        <PanelHeader
          title="Live intelligence feed health"
          subtitle="Actual routed output consumed by market context, news, sentiment and on-chain surfaces"
          action={<button type="button" className="apex-v3-button secondary compact" disabled={loading} onClick={() => void refresh()}>{loading ? <Loader2 className="spin" size={13} /> : <Activity size={13} />} Refresh live feeds</button>}
        />
        {loading && !feedHealth ? <div className="apex-v3-feed-health-skeleton"><i /><i /><i /><i /><i /></div> : <div className="apex-v3-feed-health-grid">
          {([
            ['Market', feedHealth?.market],
            ['Fear & Greed', feedHealth?.fearGreed],
            ['News', feedHealth?.news],
            ['Whales', feedHealth?.whales],
            ['ETH oracle', feedHealth?.ethOracle],
          ] as const).map(([label, row]) => {
            const state = row?.status || (feedHealth?.ok ? 'unknown' : 'error');
            const source = row && 'source' in row && typeof row.source === 'string' ? row.source : null;
            const detail = source || row?.detail || 'No verified observation';
            return <div className={`feed-${state}`} key={label} title={row?.detail || detail}>
              <span><i />{label}</span><strong>{state.replaceAll('_', ' ')}</strong><small>{detail}</small>
            </div>;
          })}
        </div>}
        <div className="apex-v3-integration-history">
          <strong>Recent credential verification</strong>
          {probeHistory.length ? probeHistory.slice(0, 6).map((row) => <div key={row.id}><span>{row.state}</span><b>{row.summary}</b><small>{row.latencyMs == null ? '—' : `${row.latencyMs} ms`} · {new Date(row.checkedAt).toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' })} UTC</small></div>) : <p>No credential verification has run in this server session.</p>}
        </div>
        <p className="apex-v3-form-note">Feed snapshot: {feedHealth?.fetchedAt ? new Date(feedHealth.fetchedAt).toLocaleString('en-GB', { hour12: false, timeZone: 'UTC' }) + ' UTC' : 'Unavailable'}. Missing values remain unavailable; this panel does not synthesize healthy state.</p>
      </Panel>

      <Panel className="settings-integration-card">
        <PanelHeader title="Managed provider credentials" subtitle="Save new values or verify the keys already stored on the server" action={loading ? <Loader2 className="spin" size={16} /> : undefined} />
        <div className="apex-v3-provider-key-grid">
          {KEY_ROWS.map((row) => {
            const result = probeResults[row.key];
            const Icon = row.icon;
            const secretValue = secrets[row.key];
            const showsStoredMarker = configured[row.key] && secretValue == null;
            const effectiveVerified = hasLivePass(verified[row.key], result);
            return (
              <div className={`apex-v3-provider-key ${providerCardState(configured[row.key], effectiveVerified)}`} data-provider-key={row.key} key={row.key}>
                <div className="apex-v3-provider-key-head">
                  <span className="apex-v3-provider-key-icon" aria-hidden="true"><Icon size={13} strokeWidth={2.1} /></span>
                  <span className="apex-v3-provider-key-title"><strong>{row.label}</strong><small>{row.detail}{(keyCounts[row.key] || 0) > 1 ? ` · ${keyCounts[row.key]} keys in rotation` : ''}</small></span>
                  <StatusBadge tone={statusTone(configured[row.key], effectiveVerified)}>{statusLabel(configured[row.key], effectiveVerified)}</StatusBadge>
                </div>
                <div className="apex-v3-provider-key-input">
                  <input
                    type={showsStoredMarker ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={showsStoredMarker ? STORED_SECRET_MARKER : ((secretValue as string | undefined) || '')}
                    placeholder={configured[row.key] ? 'Paste to replace stored key' : row.placeholder}
                    className={showsStoredMarker ? 'has-stored-marker' : undefined}
                    onFocus={() => {
                      if (showsStoredMarker) setSecrets((current) => ({ ...current, [row.key]: '' }));
                    }}
                    onBlur={() => {
                      if (configured[row.key] && secrets[row.key] === '') {
                        setSecrets((current) => {
                          const next = { ...current };
                          delete next[row.key];
                          return next;
                        });
                      }
                    }}
                    onChange={(event) => setSecrets((current) => ({ ...current, [row.key]: event.target.value }))}
                    aria-label={`${row.label} credential`}
                  />
                  <button type="button" className="apex-v3-provider-test-button" disabled={!configured[row.key] || probingKey != null} onClick={() => void probe(row.key)} aria-label={`Test ${row.label} stored credential against live upstream`}>
                    {probingKey === row.key ? <Loader2 className="spin" size={13} /> : <FlaskConical size={13} />} Test
                  </button>
                </div>
                {result && (
                  <small
                    className={`apex-v3-provider-result ${result.ok ? 'positive' : 'negative'}`}
                    title={formatProbeTooltip(result)}
                    aria-label={formatProbeTooltip(result)}
                  >
                    {formatProbeSummary(result)}
                  </small>
                )}
              </div>
            );
          })}
        </div>

        <div className="apex-v3-news-query-card">
          <div className="apex-v3-news-query-head"><DatabaseZap size={16} /><span><strong>Newsdata query controls</strong><small>Real request policy used by the supplemental feed</small></span></div>
          <div className="apex-v3-form-grid compact-grid">
            <div className="three">
              <label><span>Endpoint</span><select value={newsApiQuery.endpoint || 'everything'} onChange={(event) => setNewsApiQuery((current) => ({ ...current, endpoint: event.target.value as NewsApiQueryOptions['endpoint'] }))}><option value="everything">Everything</option><option value="top-headlines">Top headlines</option></select></label>
              <label><span>Sort by</span><select value={newsApiQuery.sortBy || 'publishedAt'} onChange={(event) => setNewsApiQuery((current) => ({ ...current, sortBy: event.target.value as NewsApiQueryOptions['sortBy'] }))}><option value="publishedAt">Published date</option><option value="relevancy">Relevancy</option><option value="popularity">Popularity</option></select></label>
              <label><span>Language</span><input maxLength={2} value={newsApiQuery.language || 'en'} onChange={(event) => setNewsApiQuery((current) => ({ ...current, language: event.target.value }))} /></label>
            </div>
            <div className="three">
              <label><span>Page size</span><input type="number" min="1" max="100" value={newsApiQuery.pageSize ?? 10} onChange={(event) => setNewsApiQuery((current) => ({ ...current, pageSize: Number(event.target.value) }))} /></label>
              <label><span>Lookback days</span><input type="number" min="0" max="30" value={newsApiQuery.lookbackDays ?? 7} onChange={(event) => setNewsApiQuery((current) => ({ ...current, lookbackDays: Number(event.target.value) }))} /></label>
              <label><span>Search in</span><input value={newsApiQuery.searchIn || 'title,description'} onChange={(event) => setNewsApiQuery((current) => ({ ...current, searchIn: event.target.value }))} /></label>
            </div>
            <div className="apex-v3-toggle-row apex-v3-news-query-toggles">
              <label className="apex-v3-check"><input type="checkbox" checked={newsApiQuery.includeCryptoTerms !== false} onChange={(event) => setNewsApiQuery((current) => ({ ...current, includeCryptoTerms: event.target.checked }))} /><span>Add crypto terms to symbol queries</span></label>
              <label className="apex-v3-check"><input type="checkbox" checked={newsApiQuery.cryptoOnly !== false} onChange={(event) => setNewsApiQuery((current) => ({ ...current, cryptoOnly: event.target.checked }))} /><span>Filter unrelated headlines</span></label>
            </div>
          </div>

          <div className="apex-v3-button-row apex-v3-news-query-actions">
            <span className="apex-v3-news-query-action-note">Applies to supplemental headline requests</span>
            <button className="apex-v3-button primary apex-v3-action-compact" type="button" disabled={savingKeys} onClick={() => void saveKeys()}>{savingKeys ? <Loader2 className="spin" size={14} /> : <Save size={14} />} Save settings</button>
            <button className="apex-v3-button secondary apex-v3-action-compact" type="button" disabled={!configuredCount || probingKey != null} onClick={() => void probe()}>{probingKey === 'all' ? <Loader2 className="spin" size={14} /> : <FlaskConical size={14} />} Verify keys</button>
          </div>
        </div>
      </Panel>

      <Panel className="settings-integration-card external-source-card">
        <PanelHeader
          title="Custom API profiles"
          subtitle="Operator-managed endpoints. Profiles are dormant until explicitly consumed by a typed provider adapter."
          action={(
            <div className="apex-v3-profile-panel-actions">
              <button
                type="button"
                className="apex-v3-button secondary compact"
                onClick={() => {
                  setCustomProfilesOpen((current) => !current);
                  if (customProfilesOpen) setExpandedSource(null);
                }}
                aria-expanded={customProfilesOpen}
              >
                {customProfilesOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                {customProfilesOpen ? 'Hide profiles' : `Show ${sources.length} profiles`}
              </button>
              {customProfilesOpen && (
                <button type="button" className="apex-v3-button secondary compact" onClick={addSource}><Plus size={13} /> Add profile</button>
              )}
            </div>
          )}
        />
        {customProfilesOpen && (
          <>
            <div className="apex-v3-external-source-list">
              {!sources.length && <div className="apex-v3-compact-empty"><CircleAlert size={18} /><span><strong>No custom profiles</strong><small>Add an endpoint or restore the project defaults.</small></span></div>}
              {sources.map((source) => {
                const expanded = expandedSource === source.id;
                const test = sourceTests[source.id];
                return (
                  <article className={`apex-v3-external-source ${expanded ? 'expanded' : ''}`} key={source.id}>
                    <div className="apex-v3-external-source-head">
                      <label className="apex-v3-source-enable"><input type="checkbox" checked={source.enabled} onChange={(event) => updateSource(source.id, { enabled: event.target.checked })} /><span /></label>
                      <button type="button" className="apex-v3-source-summary" onClick={() => setExpandedSource(expanded ? null : source.id)} aria-expanded={expanded}>
                        <span><strong>{source.name || 'Untitled source'}</strong><small>{source.category} · {source.method} · {source.baseUrl || 'URL required'}</small></span>
                        {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                      <StatusBadge tone={test ? (test.ok ? 'positive' : 'negative') : source.enabled ? 'info' : 'neutral'}>{test ? (test.ok ? `${test.latencyMs ?? '—'} ms` : 'Test failed') : source.enabled ? 'Enabled' : 'Disabled'}</StatusBadge>
                    </div>
                    {expanded && (
                      <div className="apex-v3-external-source-editor">
                        <div className="two">
                          <label><span>Name</span><input value={source.name} onChange={(event) => updateSource(source.id, { name: event.target.value })} /></label>
                          <label><span>Category</span><select value={source.category} onChange={(event) => updateSource(source.id, { category: event.target.value as ExternalApiSource['category'] })}><option value="news">News</option><option value="sentiment">Sentiment</option><option value="onchain">On-chain</option><option value="exchange">Exchange</option><option value="webhook">Webhook</option><option value="custom">Custom</option></select></label>
                        </div>
                        <label><span>Base URL</span><input value={source.baseUrl} onChange={(event) => updateSource(source.id, { baseUrl: event.target.value })} placeholder="https://api.example.com/v1/data" /></label>
                        <div className="three">
                          <label><span>Method</span><select value={source.method} onChange={(event) => updateSource(source.id, { method: event.target.value as ExternalApiSource['method'] })}><option value="GET">GET</option><option value="POST">POST</option></select></label>
                          <label><span>Authentication</span><select value={source.authType} onChange={(event) => updateSource(source.id, { authType: event.target.value as ExternalApiSource['authType'] })}><option value="none">None</option><option value="bearer">Bearer</option><option value="apiKeyHeader">API key header</option><option value="apiKeyQuery">API key query</option><option value="customHeader">Custom header</option></select></label>
                          <label><span>Parser hint</span><input value={source.parserHint || ''} onChange={(event) => updateSource(source.id, { parserHint: event.target.value })} placeholder="news / sentiment / whales" /></label>
                        </div>
                        {source.authType !== 'none' && <div className="two"><label><span>Header/query name</span><input value={source.authKeyName || ''} onChange={(event) => updateSource(source.id, { authKeyName: event.target.value })} placeholder="X-API-Key" /></label><label><span>Secret</span><input type="password" autoComplete="new-password" value={source.secret || ''} onChange={(event) => updateSource(source.id, { secret: event.target.value })} placeholder={source.hasSecret ? 'Stored server-side · paste to replace' : 'Write-only secret'} /></label></div>}
                        <label><span>Notes</span><input value={source.notes || ''} onChange={(event) => updateSource(source.id, { notes: event.target.value })} /></label>
                        <div className="apex-v3-button-row">
                          <button type="button" className="apex-v3-button secondary" onClick={() => void testSource(source)} disabled={testingSource === source.id}>{testingSource === source.id ? <Loader2 className="spin" size={14} /> : <FlaskConical size={14} />} Save & test</button>
                          <button type="button" className="apex-v3-button danger" onClick={() => removeSource(source.id)}><Trash2 size={14} /> Remove profile</button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            <div className="apex-v3-button-row">
              <button type="button" className="apex-v3-button primary" disabled={savingSources} onClick={() => void persistSources()}>{savingSources ? <Loader2 className="spin" size={15} /> : <Save size={15} />} Save profiles</button>
              <button type="button" className="apex-v3-button secondary" disabled={savingSources} onClick={() => void restoreProfiles()}><RotateCcw size={15} /> Restore project profiles</button>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
