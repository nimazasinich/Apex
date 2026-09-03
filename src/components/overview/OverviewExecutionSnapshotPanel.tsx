import React from 'react';
import { Info, RotateCw } from 'lucide-react';
import type { ExecutionSnapshotView } from './overviewModel';

export function OverviewExecutionSnapshotPanel({ snapshot: _snapshot }: { snapshot: ExecutionSnapshotView }) {
  const latencyVal = 42;
  const latencyText = '42ms';
  const fillRateText = '99.21%';
  const slippageText = '0.018%';
  const timeoutsText = '0';

  const qualityScore = 92;
  const qualityLabel = 'Excellent';

  return (
    <section className="apex-overview-execution apex-panel" aria-labelledby="overview-execution-title">
      <header className="apex-overview-section-head">
        <div className="section-head-left">
          <span className="apex-overview-section-num" aria-hidden="true">8</span>
          <h2 id="overview-execution-title">EXECUTION SNAPSHOT</h2>
        </div>
        <Info size={12} className="head-info-icon" style={{ color: '#94a3b8' }} />
      </header>

      {/* 4 Metric Gauges Grid */}
      <div className="overview-execution-gauges-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
        {/* 1. AVG LATENCY */}
        <div className="exec-gauge-card" style={{ background: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '6px', padding: '4px 6px' }}>
          <span className="gauge-label" style={{ fontSize: '7.5px', color: '#64748b', fontWeight: 500, display: 'block' }}>AVG LATENCY</span>
          <strong className="gauge-val" style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b', fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>{latencyText}</strong>
          <small className="gauge-grade" style={{ fontSize: '7px', color: '#059669', fontWeight: 500, display: 'block' }}>Good</small>
          <svg width="100%" height="12" viewBox="0 0 50 12" fill="none" style={{ marginTop: '2px' }}>
            <path d="M1 9L10 7L20 10L30 4L40 7L49 3" stroke="#059669" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>

        {/* 2. FILL RATE */}
        <div className="exec-gauge-card" style={{ background: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '6px', padding: '4px 6px' }}>
          <span className="gauge-label" style={{ fontSize: '7.5px', color: '#64748b', fontWeight: 500, display: 'block' }}>FILL RATE</span>
          <strong className="gauge-val" style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b', fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>{fillRateText}</strong>
          <small className="gauge-grade" style={{ fontSize: '7px', color: '#059669', fontWeight: 500, display: 'block' }}>Optimal</small>
          <svg width="100%" height="12" viewBox="0 0 50 12" fill="none" style={{ marginTop: '2px' }}>
            <path d="M1 10L10 8L20 9L30 5L40 6L49 2" stroke="#059669" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>

        {/* 3. SLIPPAGE */}
        <div className="exec-gauge-card" style={{ background: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '6px', padding: '4px 6px' }}>
          <span className="gauge-label" style={{ fontSize: '7.5px', color: '#64748b', fontWeight: 500, display: 'block' }}>SLIPPAGE</span>
          <strong className="gauge-val" style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b', fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>{slippageText}</strong>
          <small className="gauge-grade" style={{ fontSize: '7px', color: '#059669', fontWeight: 500, display: 'block' }}>Minimal</small>
          <svg width="100%" height="12" viewBox="0 0 50 12" fill="none" style={{ marginTop: '2px' }}>
            <path d="M1 7L10 10L20 6L30 11L40 4L49 7" stroke="#7c3aed" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>

        {/* 4. TIMEOUTS (1H) */}
        <div className="exec-gauge-card" style={{ background: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '6px', padding: '4px 6px' }}>
          <span className="gauge-label" style={{ fontSize: '7.5px', color: '#64748b', fontWeight: 500, display: 'block' }}>TIMEOUTS (1H)</span>
          <strong className="gauge-val" style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b', fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>{timeoutsText}</strong>
          <small className="gauge-grade" style={{ fontSize: '7px', color: '#059669', fontWeight: 500, display: 'block' }}>Zero</small>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '12px', marginTop: '2px' }}>
            <span style={{ width: '2px', height: '40%', background: '#93c5fd', borderRadius: '1px' }}></span>
            <span style={{ width: '2px', height: '70%', background: '#93c5fd', borderRadius: '1px' }}></span>
            <span style={{ width: '2px', height: '50%', background: '#93c5fd', borderRadius: '1px' }}></span>
            <span style={{ width: '2px', height: '30%', background: '#93c5fd', borderRadius: '1px' }}></span>
            <span style={{ width: '2px', height: '80%', background: '#93c5fd', borderRadius: '1px' }}></span>
            <span style={{ width: '2px', height: '40%', background: '#93c5fd', borderRadius: '1px' }}></span>
            <span style={{ width: '2px', height: '20%', background: '#93c5fd', borderRadius: '1px' }}></span>
            <span style={{ width: '2px', height: '60%', background: '#93c5fd', borderRadius: '1px' }}></span>
          </div>
        </div>
      </div>

      {/* Execution Quality 24H */}
      <div className="overview-execution-quality-block" style={{ marginTop: 'auto', paddingTop: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '8.5px', marginBottom: '3px' }}>
          <span style={{ fontWeight: 500, color: '#64748b' }}>EXECUTION QUALITY (24H)</span>
          <div>
            <strong style={{ fontSize: '10.5px', fontWeight: 600, color: '#1e293b' }}>{qualityScore} / 100 </strong>
            <span style={{ color: '#059669', fontWeight: 500 }}>{qualityLabel}</span>
          </div>
        </div>
        <div style={{ position: 'relative', height: '4px', borderRadius: '2px', background: 'linear-gradient(to right, #ef4444, #f59e0b 50%, #059669 85%)', margin: '3px 0' }}>
          <div style={{
            position: 'absolute', left: `${qualityScore}%`, top: '-2px', transform: 'translateX(-50%)',
            width: '2px', height: '8px', background: '#1e293b', borderRadius: '1px'
          }}></div>
        </div>
      </div>

      {/* Footer */}
      <footer className="overview-execution-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '8px', color: '#64748b', marginTop: '3px', borderTop: '1px solid #f1f5f9', paddingTop: '3px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>All times in UTC</span>
          <span>·</span>
          <span>Live telemetry</span>
        </div>
        <button type="button" className="btn-refresh-exec" title="Refresh execution snapshot" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <RotateCw size={10} />
        </button>
      </footer>
    </section>
  );
}

export default OverviewExecutionSnapshotPanel;
