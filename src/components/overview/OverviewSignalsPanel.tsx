import React from 'react';
import { ShieldCheck } from 'lucide-react';
import type { CandidateScore, DataState } from '../../types';
import { buildSignalFunnel, type ScanMeta } from './overviewModel';

export function OverviewSignalsPanel({
  candidates,
  marketState,
  loading: _loading,
  scanMeta,
  onOpenSymbol,
  onNavigateStrategies: _onNavigateStrategies,
}: {
  candidates: CandidateScore[];
  marketState: DataState;
  loading: boolean;
  scanMeta: ScanMeta | null;
  onOpenSymbol: (symbol: string) => void;
  onNavigateStrategies: () => void;
}) {
  const marketLive = marketState === 'live';
  const funnel = buildSignalFunnel(candidates, scanMeta);

  // Gated candidate filtering
  const actionableCandidates = candidates.filter(
    (candidate) => candidate.guardPass && candidate.readinessTier !== 'BLOCKED',
  );
  const top = (actionableCandidates[0] ?? candidates[0] ?? null) as any;
  const evaluatedCount = funnel.evaluated;
  const qualifiedCount = funnel.qualified;
  const confirmedCount = funnel.confirmed;
  const expiredCount = (funnel as any).expired || 0;

  const displaySymbol = top ? `${top.symbol} ${top.direction}` : (marketLive ? 'Active Scanner' : 'Standby');
  const displayScore = top ? top.score.toFixed(2) : '—';
  const convictionPct = top ? Math.min(100, Math.round(top.score > 1 ? top.score : top.score * 100)) : 0;
  const convictionLevel = top ? (top.readinessTier === 'CONFIRMED' ? 'High' : 'Moderate') : 'None';
  const topReason = top?.reasons?.[0] ?? (top ? 'Institutional demand evidence' : 'Scanner active · Monitoring multi-timeframe candle signals');

  return (
    <section className="apex-overview-signals apex-panel" aria-labelledby="overview-signals-title">
      <header className="apex-overview-section-head">
        <div className="section-head-left">
          <span className="apex-overview-section-num" aria-hidden="true">3</span>
          <h2 id="overview-signals-title">SIGNAL / OPPORTUNITY SUMMARY</h2>
        </div>
      </header>

      {/* Signal Funnel Counters */}
      <div className="overview-signals-funnel-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
        <div className="signal-funnel-card" style={{ background: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '6px', padding: '4px 6px' }}>
          <span className="funnel-label" style={{ fontSize: '7.5px', color: '#64748b', fontWeight: 500 }}>SIGNALS GENERATED</span>
          <div className="funnel-val-row" style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginTop: '1px' }}>
            <strong className="funnel-val" style={{ fontSize: '12.5px', fontWeight: 600, color: '#1e293b', fontFamily: "'JetBrains Mono', monospace" }}>{evaluatedCount}</strong>
            <small style={{ fontSize: '7.5px', fontWeight: 600, color: '#059669' }}>live</small>
          </div>
        </div>
        <div className="signal-funnel-card" style={{ background: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '6px', padding: '4px 6px' }}>
          <span className="funnel-label" style={{ fontSize: '7.5px', color: '#64748b', fontWeight: 500 }}>QUALIFIED SIGNALS</span>
          <div className="funnel-val-row" style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginTop: '1px' }}>
            <strong className="funnel-val" style={{ fontSize: '12.5px', fontWeight: 600, color: '#1e293b', fontFamily: "'JetBrains Mono', monospace" }}>{qualifiedCount}</strong>
            <small style={{ fontSize: '7.5px', fontWeight: 600, color: '#059669' }}>gated</small>
          </div>
        </div>
        <div className="signal-funnel-card" style={{ background: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '6px', padding: '4px 6px' }}>
          <span className="funnel-label" style={{ fontSize: '7.5px', color: '#64748b', fontWeight: 500 }}>CONFIRMED SIGNALS</span>
          <div className="funnel-val-row" style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginTop: '1px' }}>
            <strong className="funnel-val" style={{ fontSize: '12.5px', fontWeight: 600, color: '#1e293b', fontFamily: "'JetBrains Mono', monospace" }}>{confirmedCount}</strong>
            <small style={{ fontSize: '7.5px', fontWeight: 600, color: '#059669' }}>ready</small>
          </div>
        </div>
        <div className="signal-funnel-card" style={{ background: '#ffffff', border: '1px solid #f1f5f9', borderRadius: '6px', padding: '4px 6px' }}>
          <span className="funnel-label" style={{ fontSize: '7.5px', color: '#64748b', fontWeight: 500 }}>EXPIRED SIGNALS</span>
          <div className="funnel-val-row" style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginTop: '1px' }}>
            <strong className="funnel-val" style={{ fontSize: '12.5px', fontWeight: 600, color: '#1e293b', fontFamily: "'JetBrains Mono', monospace" }}>{expiredCount}</strong>
            <small style={{ fontSize: '7.5px', fontWeight: 600, color: '#ef4444' }}>idle</small>
          </div>
        </div>
      </div>

      {/* Top Opportunity Section with Gating */}
      <div className="overview-opportunity-row" style={{ display: 'grid', gridTemplateColumns: '1.45fr 0.8fr 0.75fr', gap: '6px', alignItems: 'center' }}>
        <div className="opportunity-main-box" style={{ minWidth: 0 }}>
          <span className="sub-tag" style={{ fontSize: '7.5px', color: '#64748b', fontWeight: 500 }}>TOP OPPORTUNITY</span>
          <div className="opp-info-line" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px', whiteSpace: 'nowrap' }}>
            <strong className="opp-title" style={{ fontSize: '10px', fontWeight: 600, color: '#1e293b' }}>{displaySymbol}</strong>
            <span className="opp-score" style={{ fontSize: '10px', fontWeight: 600, color: '#1e293b', fontFamily: "'JetBrains Mono', monospace" }}>{displayScore}</span>
            {top && (
              <button
                className="btn-view-opp"
                onClick={() => onOpenSymbol(top.symbol)}
                style={{
                  fontSize: '7.5px', fontWeight: 500, padding: '1px 5px',
                  background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '3px',
                  cursor: 'pointer', color: '#334155'
                }}
              >
                VIEW
              </button>
            )}
          </div>
        </div>

        <div className="opportunity-conviction-bar-box">
          <span className="sub-tag" style={{ fontSize: '7.5px', color: '#64748b', fontWeight: 500 }}>CONVICTION</span>
          <strong className="conviction-pct" style={{ fontSize: '10px', fontWeight: 600, color: '#1e293b', display: 'block', fontFamily: "'JetBrains Mono', monospace" }}>{convictionPct}%</strong>
          <div className="conviction-bar-track" style={{ height: '3px', background: '#f1f5f9', borderRadius: '1.5px', overflow: 'hidden', marginTop: '2px' }}>
            <div className="conviction-bar-fill" style={{ width: `${convictionPct}%`, height: '100%', background: '#059669' }}></div>
          </div>
        </div>

        <div className="opportunity-conviction-dots-box">
          <span className="sub-tag" style={{ fontSize: '7.5px', color: '#64748b', fontWeight: 500 }}>CONVICTION</span>
          <strong className="conviction-level" style={{ fontSize: '9.5px', fontWeight: 600, color: '#1e293b', display: 'block' }}>{convictionLevel}</strong>
          <div style={{ display: 'flex', gap: '2.5px', marginTop: '3px' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                style={{
                  width: '5px', height: '5px', borderRadius: '50%',
                  backgroundColor: (convictionPct >= i * 20) ? '#059669' : '#e2e8f0'
                }}
              ></span>
            ))}
          </div>
        </div>
      </div>

      {/* Top Rejection or Reason Card */}
      <div className="overview-top-reason-card" style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        background: '#faf5ff', border: '1px solid #f3e8ff', borderRadius: '6px',
        padding: '5px 8px'
      }}>
        <span className="reason-icon-box" style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '18px', height: '18px', borderRadius: '4px',
          background: '#ede9fe', color: '#7c3aed'
        }}>
          <ShieldCheck size={13} className="reason-icon" />
        </span>
        <div className="reason-text-col" style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="reason-title" style={{ fontSize: '7px', fontWeight: 600, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.04em' }}>TOP REASON FOR SIGNAL</span>
          <span className="reason-val" style={{ fontSize: '8px', fontWeight: 500, color: '#334155' }}>
            {topReason}
          </span>
        </div>
      </div>
    </section>
  );
}
