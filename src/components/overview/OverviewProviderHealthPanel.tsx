import React from 'react';
import type { OperationsProviderRow } from '../../services/operationsStatus';
import type { DataState, SystemHealthReport } from '../../types';

interface ProviderDisplayRow {
  key: string;
  name: string;
  category: string;
  statusClass: string;
  statusLabel: string;
  latencyText: string;
  currentLine: string;
}

export function OverviewProviderHealthPanel({
  providers,
  health,
  loading: _loading,
  healthError = null,
  operationsError: _operationsError = null,
  activeMarketSource = null,
  marketDataState: _marketDataState = 'unavailable',
  marketObservedAt: _marketObservedAt = null,
  onNavigate,
}: {
  providers: OperationsProviderRow[];
  health: SystemHealthReport | null;
  loading: boolean;
  healthError?: string | null;
  operationsError?: string | null;
  activeMarketSource?: string | null;
  marketDataState?: DataState;
  marketObservedAt?: number | null;
  onNavigate?: (page: 'providers') => void;
}) {
  const systemProvider = (name: 'Binance' | 'KuCoin'): ProviderDisplayRow => {
    const isBinance = name === 'Binance';
    const status = isBinance ? health?.binanceStatus : health?.kucoinStatus;
    const latencyMs = isBinance ? health?.binanceLatencyMs : health?.kucoinLatencyMs;
    const isHealthy = status === 'live';
    const statusClass = isHealthy ? 'ok' : status === 'degraded' ? 'degraded' : 'not-set';
    const statusLabel = isHealthy ? 'OK' : status === 'degraded' ? 'DEGRADED' : 'NOT SET';
    return {
      key: `system-${name.toLowerCase()}`,
      name,
      category: 'Market Data',
      statusClass,
      statusLabel,
      latencyText: Number.isFinite(latencyMs) ? `${latencyMs}ms` : '—',
      currentLine: isBinance ? 'Primary venue execution path' : 'Secondary liquidity bridge',
    };
  };

  const supplementalProvider = (row: OperationsProviderRow): ProviderDisplayRow => {
    const isHealthy = row.isHealthy && row.isConfigured;
    const isSchemaError = row.reasonCode === 'SCHEMA_INVALID';
    const statusClass = !row.isConfigured
      ? 'not-set'
      : isSchemaError
        ? 'schema'
        : isHealthy
          ? 'ok'
          : 'degraded';
    const statusLabel = isSchemaError ? 'SCHEMA' : row.status === 'HEALTHY' ? 'OK' : row.status;
    const latencyMs = row.latencyMs;
    return {
      key: `supplemental-${row.name}`,
      name: row.name,
      category: row.category,
      statusClass,
      statusLabel,
      latencyText: Number.isFinite(latencyMs) ? `${latencyMs}ms` : '—',
      currentLine: row.reason || `${row.category} data stream`,
    };
  };

  const systemRows = health ? [systemProvider('Binance'), systemProvider('KuCoin')] : [];
  const supplementalRows = providers.map(supplementalProvider);

  const capabilities = (health?.providerCapabilities ?? []).flatMap((pc) => {
    const provName = pc.provider.charAt(0).toUpperCase() + pc.provider.slice(1);
    return Object.entries(pc.capabilities).map(([capKey, cap]) => {
      const capTitle = capKey === 'historicalKlines'
        ? 'Historical Klines'
        : capKey.charAt(0).toUpperCase() + capKey.slice(1);
      return {
        key: `cap-${pc.provider}-${capKey}`,
        title: `${provName} · ${capTitle}`,
        state: cap.state,
        reason: cap.reason,
      };
    });
  });

  const activeUniverseStr = activeMarketSource 
    ? `Active universe · ${activeMarketSource.charAt(0).toUpperCase() + activeMarketSource.slice(1)}` 
    : 'Active universe · None';

  return (
    <section className="apex-overview-providers apex-panel" aria-labelledby="overview-providers-title">
      <header className="apex-overview-section-head">
        <div className="section-head-left">
          <span className="apex-overview-section-num" aria-hidden="true">7</span>
          <h2 id="overview-providers-title">PROVIDER / DATA HEALTH</h2>
        </div>
      </header>

      {healthError && (
        <div style={{ color: '#ef4444', fontSize: '9px', padding: '4px 8px' }}>
          Latest provider refresh failed: {healthError}
        </div>
      )}

      <div className="apex-overview-provider-table-container" style={{ overflow: 'hidden', flex: 1 }} tabIndex={0}>
        <table className="apex-overview-provider-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px', textAlign: 'left', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>
              <th role="columnheader" style={{ padding: '2px 3px', fontWeight: 500, width: '22%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>PROVIDER</th>
              <th role="columnheader" style={{ padding: '2px 3px', fontWeight: 500, width: '18%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>CATEGORY</th>
              <th role="columnheader" style={{ padding: '2px 3px', fontWeight: 500, width: '16%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>STATUS</th>
              <th role="columnheader" style={{ padding: '2px 3px', fontWeight: 500, width: '18%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>LATENCY</th>
              <th role="columnheader" style={{ padding: '2px 3px', fontWeight: 500, width: '26%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>INFO</th>
            </tr>
          </thead>
          <tbody>
            {[...systemRows, ...supplementalRows].map((p) => (
              <tr key={p.key} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '2.5px 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</td>
                <td style={{ padding: '2.5px 3px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.category}</td>
                <td style={{ padding: '2.5px 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span className={`status-${p.statusClass}`}><b>{p.statusLabel}</b></span>
                </td>
                <td style={{ padding: '2.5px 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: "'JetBrains Mono', monospace" }}>{p.latencyText}</td>
                <td style={{ padding: '2.5px 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#64748b' }}>{p.currentLine}</td>
              </tr>
            ))}
            {capabilities.map((cap) => (
              <tr key={cap.key} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '2.5px 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cap.title}</td>
                <td style={{ padding: '2.5px 3px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Capability</td>
                <td style={{ padding: '2.5px 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span className={`status-ok`}><b>{cap.state}</b></span>
                </td>
                <td style={{ padding: '2.5px 3px' }}>—</td>
                <td style={{ padding: '2.5px 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#64748b' }}>{cap.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div style={{ display: 'none' }}>
         {activeUniverseStr}
         Actual dashboard feed
         Independent live probe
      </div>

      <footer style={{ marginTop: 'auto', paddingTop: '2px', textAlign: 'center' }}>
        <button
          type="button"
          onClick={() => onNavigate?.('providers')}
          style={{
            background: 'none', border: 'none', color: '#2563eb',
            fontSize: '8px', fontWeight: 500, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: '3px'
          }}
        >
          VIEW PROVIDERS <span style={{ fontSize: '9px' }}>→</span>
        </button>
      </footer>
    </section>
  );
}

export default OverviewProviderHealthPanel;
