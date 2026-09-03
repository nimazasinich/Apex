import React, { useState, useMemo } from 'react';
import {
  RotateCw,
  Search,
  ExternalLink,
  ShieldCheck,
  Radio,
  Server,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { useProviderHealth, type ProviderDisplayRow } from '../../lib/useProviderHealth';
import './ProvidersPage.css';

interface ProvidersPageProps {
  onNavigate?: (page: 'settings' | 'overview') => void;
}

export function ProvidersPage({ onNavigate }: ProvidersPageProps) {
  const { rows, summary, loading, error, refresh, lastChecked } = useProviderHealth(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (search.trim()) {
        const query = search.toLowerCase();
        const matches = row.name.toLowerCase().includes(query) ||
          row.source.toLowerCase().includes(query) ||
          row.category.toLowerCase().includes(query);
        if (!matches) return false;
      }
      if (categoryFilter !== 'all' && row.category !== categoryFilter) {
        return false;
      }
      if (statusFilter !== 'all') {
        if (statusFilter === 'ok' && row.tone !== 'ok') return false;
        if (statusFilter === 'warn' && row.tone !== 'warn') return false;
        if (statusFilter === 'unavailable' && (row.tone !== 'danger' && row.tone !== 'muted')) return false;
      }
      return true;
    });
  }, [rows, search, categoryFilter, statusFilter]);

  const categories = ['all', 'Market Data', 'News', 'Sentiment', 'On-chain', 'Capability'];

  return (
    <div className="apex-providers-page">
      <header className="apex-providers-header">
        <div className="apex-providers-header-title">
          <h1>Providers &amp; Data Infrastructure</h1>
          <p>Real-time operational health, telemetry, and routing status across data feeds, AI models, and RPCs.</p>
        </div>
        <div className="apex-providers-actions">
          <button
            type="button"
            className="apex-v3-button secondary compact"
            disabled={loading}
            onClick={() => void refresh()}
            title="Trigger an immediate health check across all registered providers"
          >
            <RotateCw size={14} className={loading ? 'spin' : ''} />
            {loading ? 'Probing…' : 'Refresh probes'}
          </button>
          {onNavigate && (
            <button
              type="button"
              className="apex-v3-button primary compact"
              onClick={() => onNavigate('settings')}
              title="Manage proxy routing policies, endpoints, and credentials"
            >
              <ExternalLink size={14} />
              Smart Proxy settings
            </button>
          )}
        </div>
      </header>

      <section className="apex-providers-stat-strip" aria-label="Provider Health Summary">
        <div className="apex-providers-stat-card">
          <small>Total Providers</small>
          <strong>{summary.total}</strong>
        </div>
        <div className="apex-providers-stat-card tone-ok">
          <small>Healthy / Active</small>
          <strong>{summary.healthy}</strong>
        </div>
        <div className="apex-providers-stat-card tone-warn">
          <small>Degraded / Retrying</small>
          <strong>{summary.degraded}</strong>
        </div>
        <div className="apex-providers-stat-card tone-danger">
          <small>Unavailable / Unset</small>
          <strong>{summary.unavailable}</strong>
        </div>
      </section>

      {error && (
        <div className="apex-v3-security-banner" style={{ background: 'color-mix(in srgb, var(--apex-negative, #ef4444) 12%, var(--apex-surface, #fff))', borderColor: 'color-mix(in srgb, var(--apex-negative, #ef4444) 35%, var(--apex-border))' }}>
          <AlertCircle size={18} style={{ color: 'var(--apex-negative, #ef4444)', flexShrink: 0 }} />
          <span>
            <strong>Provider Telemetry Alert:</strong>
            <small>{error}</small>
          </span>
        </div>
      )}

      <section className="apex-providers-controls">
        <div className="apex-providers-filter-tabs">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`apex-providers-filter-tab ${categoryFilter === cat ? 'active' : ''}`}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat === 'all' ? 'All Categories' : cat}
            </button>
          ))}
        </div>

        <div className="apex-providers-search-box">
          <Search size={14} style={{ color: 'var(--apex-muted-600, #64748b)' }} />
          <input
            type="text"
            placeholder="Search providers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </section>

      <section className="apex-providers-table-card">
        <table className="apex-providers-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Category</th>
              <th>Source / Observation</th>
              <th>Status</th>
              <th>Latency</th>
              <th>Last Checked</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row: ProviderDisplayRow) => (
              <tr key={row.key} title={row.title}>
                <td>
                  <strong>{row.name}</strong>
                </td>
                <td>
                  <span style={{ fontSize: '11px', color: 'var(--apex-muted-600, #64748b)' }}>{row.category}</span>
                </td>
                <td>
                  <span style={{ fontSize: '12px' }}>{row.source}</span>
                </td>
                <td>
                  <span className={`apex-provider-badge tone-${row.tone}`}>
                    <i />
                    {row.state}
                  </span>
                </td>
                <td>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '12px' }}>{row.latency}</span>
                </td>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: 'var(--apex-muted-600, #64748b)' }}>
                    <Clock size={12} />
                    {row.checkAge}
                  </span>
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--apex-muted-600, #64748b)' }}>
                  {loading ? 'Probing provider diagnostics…' : 'No providers match the current filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <footer className="apex-providers-footer-note">
        <div>
          <ShieldCheck size={16} style={{ verticalAlign: 'middle', marginRight: '6px', color: 'var(--apex-positive, #10b981)' }} />
          <strong>Fail-Closed Governance:</strong> Market pricing, sentiment composites, and on-chain intelligence require verified freshness. Offline or degraded feeds automatically enter fallback routes.
        </div>
        {lastChecked && (
          <div>
            Last cluster scan: <strong>{new Date(lastChecked).toLocaleTimeString()}</strong>
          </div>
        )}
      </footer>
    </div>
  );
}
