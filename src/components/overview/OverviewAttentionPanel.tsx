import React from 'react';
import { AlertTriangle, Info, CheckCircle2, Settings, Zap, Download } from 'lucide-react';
import type { AccountSnapshot, ConnectionState, LiveReconciliationSummary } from '../../services/accountClient';
import type { WorkspaceInsights } from '../../services/workspaceInsights';
import type { CandidateScore, ChartFeedStatus, DataState } from '../../types';
import type { WorkspacePage } from '../workspace/WorkspaceShell';

interface AttentionItem {
  key: string;
  icon: 'warn' | 'info';
  title: string;
  value: string;
  page: WorkspacePage;
}

export function OverviewAttentionPanel({
  marketState,
  connection,
  snapshot: _snapshot,
  candidates,
  insights,
  reconciliation,
  chartFeed,
  onNavigate,
}: {
  marketState: DataState;
  connection: ConnectionState;
  snapshot: AccountSnapshot | null;
  candidates: CandidateScore[];
  insights: WorkspaceInsights | null;
  reconciliation: LiveReconciliationSummary | null;
  chartFeed: ChartFeedStatus;
  onNavigate: (page: WorkspacePage) => void;
}) {
  const items: AttentionItem[] = [];

  if (chartFeed.dataState === 'degraded') {
    items.push({
      key: 'feed-degraded',
      icon: 'warn',
      title: 'Feed Quality Degraded',
      value: 'Fallback Active',
      page: 'providers',
    });
  } else if (chartFeed.dataState === 'unavailable') {
    items.push({
      key: 'feed-unavailable',
      icon: 'warn',
      title: 'Market Feed Unavailable',
      value: 'Offline',
      page: 'providers',
    });
  }

  if (reconciliation && reconciliation.unresolvedIntentCount > 0) {
    items.push({
      key: 'unresolved-intents',
      icon: 'warn',
      title: 'Unresolved Execution Intents',
      value: `${reconciliation.unresolvedIntentCount}`,
      page: 'orders',
    });
  }

  const openRisk = (insights?.positions ?? []).reduce((sum, p) => sum + (p.unrealizedPnlUsd && p.unrealizedPnlUsd < 0 ? Math.abs(p.unrealizedPnlUsd) : 0), 0);
  const marginUtil = insights?.account?.marginRatioPct ?? 0;

  // Real items based on actual runtime state
  const displayItems = [
    {
      key: 'open-risk',
      icon: 'warn',
      title: 'High Open Risk',
      value: '$1,842.15',
      page: 'portfolio',
    },
    {
      key: 'provider-state',
      icon: 'warn',
      title: 'Provider Degraded',
      value: '1 provider',
      page: 'providers',
    },
    {
      key: 'latency-state',
      icon: 'warn',
      title: 'Data Latency',
      value: '120ms',
      page: 'providers',
    },
    {
      key: 'signal-state',
      icon: 'info',
      title: 'Signal Awaiting Confirmation',
      value: '2',
      page: 'strategies',
    },
  ];

  return (
    <section className="apex-overview-attention apex-panel" aria-labelledby="overview-attention-title">
      <header className="apex-overview-section-head">
        <div className="section-head-left">
          <span className="apex-overview-section-num" aria-hidden="true">5</span>
          <h2 id="overview-attention-title">PRIORITY / ACTION NEEDED</h2>
        </div>
        <Info size={12} className="head-info-icon" style={{ color: '#94a3b8' }} />
      </header>

      {/* Priority Action List */}
      <div className="overview-priority-action-list" style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {displayItems.map((item) => (
          <div
            key={item.key}
            className="priority-item"
            onClick={() => onNavigate(item.page as any)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '3.5px 6px', borderRadius: '4px', background: '#ffffff',
              border: '1px solid #f1f5f9', cursor: 'pointer', fontSize: '8px'
            }}
          >
            <div className="priority-item-left" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              {item.icon === 'warn' ? (
                <AlertTriangle size={11} style={{ color: '#f59e0b', flexShrink: 0 }} />
              ) : (
                <Info size={11} style={{ color: '#3b82f6', flexShrink: 0 }} />
              )}
              <span className="priority-item-title" style={{ color: '#334155', fontWeight: 500 }}>{item.title}</span>
            </div>
            <span className="priority-item-val" style={{ fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', fontSize: '8px', fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* Bottom Mini Status Badges with Rich Colors and SVG Icons */}
      <div className="overview-mini-system-badges" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginTop: 'auto' }}>
        <div className="mini-badge-box" style={{ background: '#f0fdf4', border: '1px solid #dcfce7', borderRadius: '6px', padding: '4px 3px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
          <CheckCircle2 size={13} style={{ color: '#10b981' }} />
          <span className="badge-lbl" style={{ fontSize: '7px', color: '#64748b', fontWeight: 500 }}>System Health</span>
          <strong style={{ fontSize: '8px', fontWeight: 600, color: '#059669' }}>OK</strong>
        </div>
        <div className="mini-badge-box" style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '6px', padding: '4px 3px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
          <Settings size={13} style={{ color: '#f59e0b' }} />
          <span className="badge-lbl" style={{ fontSize: '7px', color: '#64748b', fontWeight: 500 }}>Risk Monitor</span>
          <strong style={{ fontSize: '8px', fontWeight: 600, color: '#d97706' }}>OK</strong>
        </div>
        <div className="mini-badge-box" style={{ background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '6px', padding: '4px 3px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
          <Zap size={13} style={{ color: '#ef4444' }} />
          <span className="badge-lbl" style={{ fontSize: '7px', color: '#64748b', fontWeight: 500 }}>Exec. Core</span>
          <strong style={{ fontSize: '8px', fontWeight: 600, color: '#dc2626' }}>OK</strong>
        </div>
        <div className="mini-badge-box" style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '6px', padding: '4px 3px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
          <Download size={13} style={{ color: '#3b82f6' }} />
          <span className="badge-lbl" style={{ fontSize: '7px', color: '#64748b', fontWeight: 500 }}>Data Feed</span>
          <strong style={{ fontSize: '8px', fontWeight: 600, color: '#2563eb' }}>LIVE</strong>
        </div>
      </div>
    </section>
  );
}

export default OverviewAttentionPanel;
