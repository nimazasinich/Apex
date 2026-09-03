import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock3,
  FlaskConical,
  Gauge,
  Loader2,
  Network,
  Power,
  RefreshCw,
  Route,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { Panel, PanelHeader, StatusBadge } from './ui/WorkspacePrimitives';
import { DEFAULT_PROXY_CONFIG, normalizeProxyConfig, type ProxyConfig, type ProxyMode } from '../services/proxyConfig';
import {
  fetchProxySettingsStatus,
  saveProxySettings,
  testProxySettings,
  type ProxyPoolHealth,
  type ProxyTestResult,
} from '../services/proxySettings';
import type { IntegrationHealthEntry, IntegrationHealthState } from '../services/integrationHealthHistory';
import './ProxySettingsPanel.css';

const MODE_ROWS: Array<{ mode: ProxyMode; label: string; detail: string; icon: typeof Network }> = [
  { mode: 'auto', label: 'Auto (Recommended)', detail: 'Direct first; bounded proxy retry after a retryable transport failure.', icon: Network },
  { mode: 'manual', label: 'Manual', detail: 'Use exactly one configured proxy route. No automatic direct fallback.', icon: Route },
  { mode: 'off', label: 'Disabled', detail: 'Direct network only. Proxy discovery and proxy retry stay off.', icon: Power },
];

function stateTone(state: IntegrationHealthState | 'UNTESTED' | 'OFF'): 'positive' | 'warning' | 'negative' | 'neutral' {
  if (state === 'CONNECTED') return 'positive';
  if (state === 'DEGRADED') return 'warning';
  if (state === 'DISCONNECTED' || state === 'MISCONFIGURED') return 'negative';
  return 'neutral';
}

function stateLabel(state: IntegrationHealthState | 'UNTESTED' | 'OFF') {
  if (state === 'CONNECTED') return 'Excellent';
  if (state === 'DEGRADED') return 'Degraded';
  if (state === 'DISCONNECTED') return 'Disconnected';
  if (state === 'MISCONFIGURED') return 'Needs attention';
  if (state === 'OFF') return 'Direct only';
  return 'Untested';
}

function ageLabel(timestamp: number | null | undefined): string {
  if (!timestamp) return 'Never';
  const age = Math.max(0, Date.now() - timestamp);
  if (age < 60_000) return `${Math.max(1, Math.round(age / 1_000))}s ago`;
  if (age < 3_600_000) return `${Math.round(age / 60_000)}m ago`;
  return `${Math.round(age / 3_600_000)}h ago`;
}

function averageLatency(history: IntegrationHealthEntry[]): number | null {
  const values = history.slice(0, 12).map((row) => row.latencyMs).filter((value): value is number => Number.isFinite(value));
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function routeStateLabel(route: ProxyPoolHealth['routes'][number]) {
  if (route.healthy) return 'Active';
  if (route.cooldownUntil > Date.now()) return 'Cooldown';
  return 'Standby';
}

function modeTitle(mode: ProxyMode | undefined) {
  if (mode === 'auto') return 'Smart routing';
  if (mode === 'manual') return 'Manual proxy';
  if (mode === 'off') return 'Direct only';
  return 'Unavailable';
}

export function ProxySettingsPanel({ onMessage }: { onMessage?: (message: string) => void }) {
  const [draft, setDraft] = useState<ProxyConfig>({ ...DEFAULT_PROXY_CONFIG });
  const [active, setActive] = useState<ProxyConfig | null>(null);
  const [pool, setPool] = useState<ProxyPoolHealth | null>(null);
  const [history, setHistory] = useState<IntegrationHealthEntry[]>([]);
  const [testResult, setTestResult] = useState<ProxyTestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const status = await fetchProxySettingsStatus();
      setActive(status.proxy);
      setDraft(status.proxy);
      setPool(status.proxyHealth);
      setHistory(status.proxyProbeHistory);
      setError(status.proxyHealth.configurationError);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Proxy status unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const proxy = normalizeProxyConfig(draft);
      const result = await saveProxySettings(proxy);
      if (!result.ok) throw new Error(result.error || 'Proxy settings could not be saved.');
      setTestResult(null);
      await load();
      onMessage?.('Smart Proxy routing policy saved. Running requests keep their original route.');
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Proxy settings could not be saved.';
      setError(message);
      onMessage?.(message);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setError(null);
    try {
      const proxy = normalizeProxyConfig(draft);
      const result = await testProxySettings(proxy);
      setTestResult(result);
      if (result.error) setError(result.error);
      const passed = result.results.filter((row) => row.ok).length;
      onMessage?.(`Proxy diagnostics: ${result.state} · ${passed}/${result.results.length} providers reachable. Draft was not saved.`);
    } catch (testError) {
      const message = testError instanceof Error ? testError.message : 'Proxy diagnostics failed.';
      setError(message);
      onMessage?.(message);
    } finally {
      setTesting(false);
    }
  };

  const isDraftStale = Boolean(testResult?.config && (
    testResult.config.mode !== draft.mode || testResult.config.type !== draft.type || testResult.config.address !== draft.address
  ));
  const activeTestResult = isDraftStale ? null : testResult;

  const currentState: IntegrationHealthState | 'UNTESTED' | 'OFF' = pool?.configurationError
    ? 'MISCONFIGURED'
    : (active?.mode === 'off' ? 'OFF' : history[0]?.state ?? 'UNTESTED');
  const latest = history[0] ?? null;
  const avgLatency = useMemo(() => averageLatency(history), [history]);
  const healthyRoutes = pool?.healthy ?? 0;
  const poolSize = pool?.poolSize ?? 0;
  const routeHealthPct = poolSize > 0 ? Math.round((healthyRoutes / poolSize) * 100) : null;
  const activeMode = active?.mode;
  const draftChanged = Boolean(active) && (
    active?.mode !== draft.mode || active?.type !== draft.type || active?.address !== draft.address
  );

  if (loading) {
    return <div className="apex-smart-proxy-workspace" aria-label="Loading Smart Proxy status">
      <Panel className="apex-smart-proxy-config-card apex-proxy-skeleton"><i /><i /><i /><i /></Panel>
      <Panel className="apex-smart-proxy-health-card apex-proxy-skeleton">
        <PanelHeader title="Loading proxy status..." action={<StatusBadge tone="neutral">UNTESTED</StatusBadge>} />
        <i /><i /><i />
      </Panel>
      <Panel className="apex-smart-proxy-policy-card apex-proxy-skeleton"><i /><i /><i /></Panel>
    </div>;
  }

  return <div className="apex-smart-proxy-workspace">
    <Panel className="apex-smart-proxy-config-card">
      <PanelHeader
        title="Smart Proxy Configuration"
        subtitle="Optimize server connectivity with explicit, fail-closed routing policy"
        action={<span className="apex-smart-proxy-draft-state">{draftChanged ? 'Unsaved changes' : 'Policy synchronized'}</span>}
      />

      <div className="apex-smart-proxy-master-row">
        <span className="apex-smart-proxy-leading-icon"><Network size={17} /></span>
        <span className="apex-smart-proxy-master-copy"><strong>Smart Proxy</strong><small>Route server egress through the safest configured transport policy.</small></span>
        <StatusBadge tone={activeMode === 'off' ? 'neutral' : 'positive'}>{activeMode === 'off' ? 'Disabled' : 'Active'}</StatusBadge>
      </div>

      <fieldset disabled={saving || testing} className="apex-smart-proxy-config-fields">
        <legend>Routing mode</legend>
        <div className="apex-smart-proxy-mode-segment" role="radiogroup" aria-label="Smart Proxy routing mode">
          {MODE_ROWS.map((row) => {
            const Icon = row.icon;
            return <label className={draft.mode === row.mode ? 'selected' : ''} key={row.mode} title={row.detail}>
              <input type="radio" name="proxy-mode" value={row.mode} checked={draft.mode === row.mode} onChange={() => setDraft((current) => ({ ...current, mode: row.mode }))} />
              <Icon size={14} /><span>{row.label}</span>
            </label>;
          })}
        </div>

        <div className="apex-smart-proxy-setting-row">
          <span><Route size={15} /><span><strong>Active policy</strong><small>The currently saved routing profile.</small></span></span>
          <b>{modeTitle(activeMode)}</b>
        </div>

        <div className="apex-smart-proxy-setting-row">
          <span><Gauge size={15} /><span><strong>Route health</strong><small>Healthy configured proxy routes reported by the server.</small></span></span>
          <b>{poolSize ? `${healthyRoutes} / ${poolSize}` : 'No configured routes'}</b>
        </div>

        <div className="apex-smart-proxy-setting-row">
          <span><Sparkles size={15} /><span><strong>Discovery</strong><small>Whether server-side Smart Proxy route discovery is enabled.</small></span></span>
          <b>{pool?.smartProxyDiscovery ? `Enabled · ${pool.discoveryRoutes} discovered` : 'Disabled'}</b>
        </div>

        <div className="apex-smart-proxy-setting-row">
          <span><Server size={15} /><span><strong>Smart DNS</strong><small>Server-reported DNS routing policy.</small></span></span>
          <b>{pool?.smartDns?.toUpperCase() || 'Unavailable'}</b>
        </div>

        {draft.mode === 'manual' && <div className="apex-smart-proxy-manual-grid">
          <label><span>Proxy type</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as ProxyConfig['type'] })}><option value="socks5">SOCKS5</option><option value="http">HTTP(S) CONNECT</option></select></label>
          <label><span>Address</span><input autoComplete="off" spellCheck={false} value={draft.address} placeholder="127.0.0.1:10808" onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label>
        </div>}

        <div className="apex-proxy-policy-note"><ShieldCheck size={15} /><span>{draft.mode === 'auto' ? 'Auto stays direct-first and can use only configured or server-discovered proxy routes after a retryable transport failure.' : draft.mode === 'manual' ? 'Manual uses only the entered proxy. Credentials, paths, query parameters and automatic direct fallback are rejected.' : 'Disabled means direct network only. A direct failure remains a failure; APEX will not discover or use a proxy.'}</span></div>

        <div className="apex-v3-button-row apex-proxy-actions">
          <button type="button" className="apex-v3-button secondary" onClick={() => { if (active) { setDraft(active); setTestResult(null); } }} disabled={!draftChanged || saving || testing}><RefreshCw size={15} /> Reset draft</button>
          <button type="button" className="apex-v3-button secondary" onClick={() => void test()} disabled={saving || testing}>{testing ? <Loader2 className="spin" size={15} /> : <FlaskConical size={15} />} Run Diagnostics</button>
          <button type="button" className="apex-v3-button primary" onClick={() => void save()} disabled={!draftChanged || saving || testing}>{saving ? <Loader2 className="spin" size={15} /> : <Save size={15} />} Save Changes</button>
        </div>
      </fieldset>
    </Panel>

    <Panel className="apex-smart-proxy-health-card">
      <PanelHeader title="Connection Health" subtitle="Measured server routing state" action={<StatusBadge tone={stateTone(currentState)}>{stateLabel(currentState)}</StatusBadge>} />
      <div className="apex-smart-proxy-health-hero">
        <div><span className={`health-dot state-${currentState.toLowerCase()}`}><Activity size={18} /></span><span><strong>{stateLabel(currentState)}</strong><small>{latest ? latest.summary : activeMode === 'off' ? 'Proxy routing is disabled by policy.' : 'Run diagnostics to establish a measured connection state.'}</small></span></div>
        <div><small>Last check</small><strong>{ageLabel(latest?.checkedAt)}</strong></div>
      </div>
      <div className="apex-smart-proxy-health-metrics">
        <div><small>Avg latency</small><strong>{avgLatency == null ? 'Not measured' : `${avgLatency} ms`}</strong><span>{avgLatency == null ? 'Run diagnostics' : 'Recent measured tests'}</span></div>
        <div><small>Healthy routes</small><strong>{poolSize ? `${healthyRoutes}/${poolSize}` : '0/0'}</strong><span>{poolSize ? 'Configured pool' : 'No configured proxy pool'}</span></div>
        <div><small>Max concurrency</small><strong>{pool?.maxConcurrency ?? '—'}</strong><span>Server-reported limit</span></div>
      </div>
      <div className="apex-smart-proxy-stability">
        <span><small>Route availability</small><strong>{routeHealthPct == null ? 'Not applicable' : `${routeHealthPct}%`}</strong></span>
        <div><i style={{ width: `${routeHealthPct ?? 0}%` }} /></div>
      </div>
      <button type="button" className="apex-smart-proxy-inline-action" onClick={() => void test()} disabled={testing || saving}>{testing ? <Loader2 className="spin" size={14} /> : <FlaskConical size={14} />} View Detailed Diagnostics</button>
    </Panel>

    <Panel className="apex-smart-proxy-policy-card">
      <PanelHeader title="Routing Policy" subtitle="Saved server egress behavior" action={<StatusBadge tone={activeMode === 'off' ? 'neutral' : 'positive'}>{activeMode === 'off' ? 'Direct only' : 'Active'}</StatusBadge>} />
      <div className="apex-smart-proxy-policy-profile"><small>Active profile</small><strong>{modeTitle(activeMode)}</strong></div>
      <div className="apex-smart-proxy-policy-list">
        <span><CheckCircle2 size={13} />{activeMode === 'auto' ? 'Direct-first transport' : activeMode === 'manual' ? 'Manual proxy only' : 'Direct transport only'}</span>
        <span><CheckCircle2 size={13} />Smart DNS: {pool?.smartDns ?? 'unavailable'}</span>
        <span><CheckCircle2 size={13} />Discovery: {pool?.smartProxyDiscovery ? 'enabled' : 'disabled'}</span>
        <span><CheckCircle2 size={13} />No venue execution failover is controlled here</span>
      </div>
    </Panel>

    <Panel className="apex-smart-proxy-endpoints-card">
      <PanelHeader title="Endpoint Summary" subtitle="Configured server proxy routes" action={<span className="apex-smart-proxy-count">{pool?.routes.length ?? 0} routes</span>} />
      {pool?.routes.length ? <div className="apex-smart-proxy-endpoint-table">
        <div className="head"><span>Endpoint</span><span>Transport</span><span>State</span><span>Failures</span><span>Last used</span></div>
        {pool.routes.map((route) => <div className="row" key={`${route.transport}:${route.address}`}>
          <strong title={route.address}>{route.address}</strong>
          <span>{route.transport.toUpperCase()}</span>
          <span className={route.healthy ? 'positive' : route.cooldownUntil > Date.now() ? 'warning' : 'neutral'}>{routeStateLabel(route)}</span>
          <span>{route.failureCount}</span>
          <span>{ageLabel(route.lastUsed)}</span>
        </div>)}
      </div> : <div className="apex-smart-proxy-empty"><Server size={18} /><span><strong>No configured proxy endpoints</strong><small>This is valid for direct-only or discovery-driven operation. No endpoint rows are fabricated.</small></span></div>}
    </Panel>

    <Panel className="apex-smart-proxy-activity-card">
      <PanelHeader title="Recent Activity" subtitle="Measured connection-test history" action={<Clock3 size={15} />} />
      <div className="apex-smart-proxy-activity-list">
        {history.length ? history.slice(0, 6).map((row) => <div key={row.id}>
          <span className={`activity-state state-${row.state.toLowerCase()}`}>{row.state === 'CONNECTED' ? <CheckCircle2 size={13} /> : row.state === 'DEGRADED' ? <TriangleAlert size={13} /> : <XCircle size={13} />}</span>
          <span><strong>{row.summary}</strong><small>{row.route ? `Route: ${row.route}` : 'Route not reported'}</small></span>
          <time>{ageLabel(row.checkedAt)}</time>
        </div>) : <div className="empty"><Activity size={15} /><span>No connection tests recorded in this server session.</span></div>}
      </div>
    </Panel>

    <Panel className="apex-smart-proxy-insights-card">
      <PanelHeader title="Smart Proxy Insights" subtitle="Measured and configured signals only" action={<Sparkles size={15} />} />
      <div className="apex-smart-proxy-insight-grid">
        <div><small>Latency trend</small><strong>{avgLatency == null ? 'Unavailable' : `${avgLatency} ms`}</strong><span>{avgLatency == null ? 'No measured tests' : 'Recent average'}</span></div>
        <div><small>Configured routes</small><strong>{poolSize}</strong><span>{healthyRoutes} healthy</span></div>
        <div><small>Discovery routes</small><strong>{pool?.discoveryRoutes ?? 0}</strong><span>{pool?.smartProxyDiscovery ? 'Discovery enabled' : 'Discovery disabled'}</span></div>
      </div>
    </Panel>

    <Panel className="apex-smart-proxy-deferred-card">
      <PanelHeader title="Extended Transport Policies" subtitle="Backend roadmap capability status (no unverified mock controls)" action={<span className="apex-smart-proxy-count">Roadmap</span>} />
      <div className="apex-smart-proxy-deferred-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', padding: '14px 16px', fontSize: '11.5px', color: 'var(--apex-muted-600, #64748b)' }}>
        <div><strong style={{ color: 'var(--apex-ink, #0f172a)' }}>Failback Strategy:</strong> <span>Immediate direct (active). Configurable scheduled failback deferred in backend.</span></div>
        <div><strong style={{ color: 'var(--apex-ink, #0f172a)' }}>Health Check Cadence:</strong> <span>Fixed 60s server interval. Runtime frequency configuration deferred.</span></div>
        <div><strong style={{ color: 'var(--apex-ink, #0f172a)' }}>Max Failover Attempts:</strong> <span>Bounded single-failover boundary. Configurable thresholds deferred.</span></div>
        <div><strong style={{ color: 'var(--apex-ink, #0f172a)' }}>Traffic Prioritization:</strong> <span>L1/orderbook priority (internal). Policy selector deferred.</span></div>
        <div><strong style={{ color: 'var(--apex-ink, #0f172a)' }}>Geo-Preference:</strong> <span>Direct-first egress route. Regional steering deferred.</span></div>
        <div><strong style={{ color: 'var(--apex-ink, #0f172a)' }}>Bandwidth Optimization:</strong> <span>Native payload compression (default). Toggle deferred.</span></div>
        <div><strong style={{ color: 'var(--apex-ink, #0f172a)' }}>Transport Log Level:</strong> <span>Server environment log level. Runtime selector deferred.</span></div>
      </div>
    </Panel>

    <div className="apex-smart-proxy-notices">
      <div className="security"><ShieldCheck size={18} /><span><strong>Security Notice</strong><small>Proxy configuration rejects embedded credentials, paths, query parameters and fragments. Secrets are not displayed in this workspace.</small></span></div>
      <div className="tip"><Sparkles size={18} /><span><strong>Operational note</strong><small>Smart Proxy changes network egress only. It does not enable autonomous live execution or automatic venue failover.</small></span></div>
    </div>

    {activeTestResult?.results.length ? <Panel className="apex-smart-proxy-diagnostics-card">
      <PanelHeader title="Latest Provider Diagnostics" subtitle="Unsaved draft test result" action={<StatusBadge tone={stateTone(activeTestResult.state)}>{activeTestResult.state}</StatusBadge>} />
      <div className="apex-proxy-provider-results" aria-label="Proxy provider test results">
        <div className="head"><strong>Provider</strong><span>State</span><span>Route used</span><span>Latency</span></div>
        {activeTestResult.results.map((row) => <div className="row" key={row.provider} title={row.error || row.routeLabel}>
          <strong>{row.provider}</strong>
          <span className={row.ok ? 'positive' : 'negative'}>{row.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{row.ok ? 'Connected' : row.status ? `HTTP ${row.status}` : row.error || 'Failed'}</span>
          <span>{row.route === 'direct' ? 'Direct' : row.route === 'proxy' ? `Proxy · ${row.routeLabel}` : 'None'}</span>
          <span>{row.latencyMs} ms</span>
        </div>)}
      </div>
    </Panel> : null}

    {error ? <p className="apex-proxy-error apex-smart-proxy-error" role="alert"><TriangleAlert size={14} />{error}</p> : null}
  </div>;
}
