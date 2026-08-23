import React from 'react';
import { Server } from 'lucide-react';
import type { ConnectionState, LiveReconciliationSummary } from '../../services/accountClient';

type StripTone = 'ok' | 'warn' | 'danger' | 'info' | 'muted';

export function OverviewSystemHealthPanel({
  connection,
  reconciliation,
}: {
  connection: ConnectionState;
  reconciliation: LiveReconciliationSummary | null;
}) {
  const rows: Array<{ label: string; value: string; tone: StripTone; title?: string }> = [];

  if (connection.status === 'not_connected') rows.push({ label: 'Account', value: 'NOT SET', tone: 'muted', title: 'No verified account' });
  else if (connection.status === 'demo') rows.push({ label: 'Account', value: 'DEMO', tone: 'info', title: 'Demo wallet active' });
  else rows.push({ label: 'Account', value: connection.executionState === 'unlocked' ? 'LIVE' : 'READ-ONLY', tone: connection.executionState === 'unlocked' ? 'ok' : 'warn', title: connection.executionState === 'unlocked' ? 'Live execution unlocked' : 'Live account is read-only' });

  if (reconciliation) {
    const healthy = reconciliation.reconciliationHealthy && reconciliation.unresolvedIntentCount === 0;
    rows.push({ label: 'Execution', value: healthy ? 'HEALTHY' : `${reconciliation.unresolvedIntentCount} OPEN`, tone: healthy ? 'ok' : reconciliation.reconciliationHealthy ? 'warn' : 'danger', title: reconciliation.latestError ?? 'Unresolved live execution intents' });
    rows.push({ label: 'Intents', value: String(reconciliation.unresolvedIntentCount), tone: reconciliation.unresolvedIntentCount === 0 ? 'ok' : 'warn' });
  } else {
    rows.push({ label: 'Execution', value: connection.mode === 'live' ? 'N/A' : '—', tone: 'muted', title: 'Reconciliation available in live mode only' });
  }

  rows.push({ label: 'Link', value: connection.status === 'connected' ? 'VERIFIED' : connection.status === 'demo' ? 'DEMO' : 'OFFLINE', tone: connection.status === 'connected' ? 'ok' : connection.status === 'demo' ? 'info' : 'muted' });

  return (
    <section className="apex-overview-systemhealth apex-panel" aria-labelledby="overview-systemhealth-title">
      <header>
        <h2 id="overview-systemhealth-title"><Server size={15} aria-hidden="true" />System health</h2>
      </header>
      <dl className="apex-overview-kv">
        {rows.map((row) => (
          <div key={row.label} className={row.tone ? `tone-${row.tone}` : undefined} title={row.title}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
