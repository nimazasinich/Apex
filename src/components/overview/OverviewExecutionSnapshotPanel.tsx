import React from 'react';
import { Gauge } from 'lucide-react';
import type { ExecutionSnapshotView } from './overviewModel';

export function OverviewExecutionSnapshotPanel({ snapshot }: { snapshot: ExecutionSnapshotView }) {
  const metrics = [
    { label: 'Avg Latency', value: snapshot.avgLatencyMs == null ? '—' : `${snapshot.avgLatencyMs}ms`, grade: snapshot.latencyLabel },
    { label: 'Fill Rate', value: snapshot.fillRatePct == null ? '—' : `${snapshot.fillRatePct.toFixed(2)}%`, grade: snapshot.fillLabel },
    { label: 'Avg Slippage', value: snapshot.slippagePct == null ? '—' : `${snapshot.slippagePct.toFixed(3)}%`, grade: snapshot.slippageLabel },
    { label: 'Timeouts (1h)', value: String(snapshot.timeouts1h), grade: snapshot.timeoutLabel },
  ];

  return (
    <section className="apex-overview-execution apex-panel" aria-labelledby="overview-execution-title">
      <header className="apex-overview-section-head">
        <span className="apex-overview-section-num">8</span>
        <h2 id="overview-execution-title"><Gauge size={14} /> Execution Snapshot</h2>
      </header>
      <div className="apex-overview-execution-grid">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <em>{metric.grade}</em>
          </div>
        ))}
      </div>
      <footer><small>All times in UTC · Auto-refresh on</small></footer>
    </section>
  );
}
