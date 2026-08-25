import React from 'react';
import { Database } from 'lucide-react';
import type { OperationsProviderRow } from '../../services/operationsStatus';
import { formatCheckAge, providerCheckAgeMs, providerRowState } from './overviewModel';

export function OverviewProviderHealthPanel({
  providers,
  loading,
}: {
  providers: OperationsProviderRow[];
  loading: boolean;
}) {
  const rows = providers.slice(0, 8);

  return (
    <section className="apex-overview-providers apex-panel" aria-labelledby="overview-providers-title">
      <header className="apex-overview-section-head">
        <span className="apex-overview-section-num">7</span>
        <h2 id="overview-providers-title"><Database size={14} /> Provider / Data Health</h2>
      </header>
      {rows.length ? (
        <div className="apex-overview-provider-table" role="table">
          <div className="head" role="row"><span>Provider</span><span>Type</span><span>Status</span><span>Last Check</span><span>Live</span></div>
          {rows.map((row) => {
            const checkAge = providerCheckAgeMs(row);
            const live = row.isHealthy && row.isConfigured ? 'LIVE' : row.isConfigured ? 'FALLBACK' : '—';
            return (
              <div className="row" role="row" key={row.name}>
                <strong>{row.name}</strong>
                <span>{row.category.replace(/_/g, ' ')}</span>
                <span className={`status-${providerRowState(row).replace(/\s+/g, '-').toLowerCase()}`}>{providerRowState(row)}</span>
                <span>{formatCheckAge(checkAge)}</span>
                <span>{live}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="apex-overview-calm-compact"><Database size={14} /><strong>{loading ? 'Loading provider diagnostics…' : 'Provider diagnostics unavailable'}</strong></div>
      )}
    </section>
  );
}
