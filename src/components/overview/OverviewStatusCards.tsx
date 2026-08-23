import React from 'react';
import { Activity, Bot, Lock, Radio, Server, ShieldCheck } from 'lucide-react';
import type { ConnectionState, LiveReconciliationSummary } from '../../services/accountClient';
import type { AutopilotControllerView } from '../../lib/useAutopilotController';
import type { WorkspaceInsights } from '../../services/workspaceInsights';
import type { CandidateScore, ChartFeedStatus } from '../../types';
import type { OperationsDiagnosticsSnapshot } from '../../services/operationsDiagnostics';
import { summarizeOperationsDiagnostics } from '../../services/operationsDiagnostics';

type StripTone = 'ok' | 'warn' | 'danger' | 'info' | 'muted';

interface StatusCard {
  key: string;
  label: string;
  value: string;
  tone: StripTone;
  title?: string;
  icon: React.ComponentType<{ size?: number }>;
}

export function OverviewStatusCards({
  autopilot,
  connection,
  insights,
  chartFeed,
  reconciliation,
  diagnostics,
}: {
  autopilot: AutopilotControllerView;
  connection: ConnectionState;
  insights: WorkspaceInsights | null;
  chartFeed: ChartFeedStatus;
  candidates: CandidateScore[];
  reconciliation: LiveReconciliationSummary | null;
  diagnostics: OperationsDiagnosticsSnapshot | null;
}) {
  const opsSummary = summarizeOperationsDiagnostics(diagnostics);
  const cards: StatusCard[] = [];

  const autopilotCard: StatusCard = { key: 'autopilot', label: 'Autopilot State', value: 'SYNC…', tone: 'muted', icon: Bot, title: autopilot.phaseText ?? undefined };
  switch (autopilot.phase) {
    case null: if (autopilot.transportError) { autopilotCard.value = 'OFFLINE'; autopilotCard.tone = 'warn'; } break;
    case 'OFF': autopilotCard.value = 'OFF'; autopilotCard.tone = 'muted'; break;
    case 'RESEARCHING': autopilotCard.value = 'RESEARCHING'; autopilotCard.tone = 'info'; break;
    case 'VALIDATING': autopilotCard.value = 'VALIDATING'; autopilotCard.tone = 'info'; break;
    case 'WAITING': autopilotCard.value = 'WAITING'; autopilotCard.tone = 'ok'; break;
    case 'FAILED': autopilotCard.value = 'FAILED'; autopilotCard.tone = 'danger'; autopilotCard.title = autopilot.lastError ?? undefined; break;
  }
  cards.push(autopilotCard);

  if (connection.status === 'not_connected') cards.push({ key: 'trading', label: 'Trading Permission', value: 'LOCKED', tone: 'muted', icon: Lock, title: 'No verified account' });
  else if (connection.status === 'demo') cards.push({ key: 'trading', label: 'Trading Permission', value: 'ALLOWED', tone: 'ok', icon: Lock, title: 'Demo execution enabled' });
  else cards.push({ key: 'trading', label: 'Trading Permission', value: connection.executionState === 'unlocked' ? 'ALLOWED' : 'READ-ONLY', tone: connection.executionState === 'unlocked' ? 'ok' : 'warn', icon: Lock });

  if (!insights) cards.push({ key: 'risk', label: 'Risk State', value: '—', tone: 'muted', icon: ShieldCheck });
  else {
    const label = insights.account.riskLabel;
    cards.push({
      key: 'risk',
      label: 'Risk State',
      value: label === 'Low' ? 'CLEAR' : label === 'Medium' ? 'ELEVATED' : 'HIGH',
      tone: label === 'Low' ? 'ok' : label === 'Medium' ? 'warn' : 'danger',
      icon: ShieldCheck,
      title: `Risk score ${Math.round(insights.account.riskScore)}/100`,
    });
  }

  const healthy = opsSummary.healthyProviders;
  const configured = opsSummary.configuredProviders;
  cards.push({
    key: 'providers',
    label: 'Provider Health',
    value: healthy != null && configured != null ? `${healthy} / ${configured} OK` : '—',
    tone: healthy != null && configured != null && healthy >= configured ? 'ok' : healthy != null && healthy > 0 ? 'warn' : 'muted',
    icon: Server,
  });

  if (reconciliation) {
    const healthyExec = reconciliation.reconciliationHealthy && reconciliation.unresolvedIntentCount === 0;
    cards.push({
      key: 'execution',
      label: 'Execution Health',
      value: healthyExec ? 'HEALTHY' : `${reconciliation.unresolvedIntentCount} OPEN`,
      tone: healthyExec ? 'ok' : reconciliation.reconciliationHealthy ? 'warn' : 'danger',
      icon: Activity,
      title: reconciliation.latestError ?? undefined,
    });
  } else {
    cards.push({ key: 'execution', label: 'Execution Health', value: connection.mode === 'live' ? 'N/A' : '—', tone: 'muted', icon: Activity });
  }

  if (chartFeed.loading) cards.push({ key: 'freshness', label: 'Data Freshness', value: 'SYNC…', tone: 'muted', icon: Radio });
  else if (chartFeed.error) cards.push({ key: 'freshness', label: 'Data Freshness', value: 'NO FEED', tone: 'warn', icon: Radio, title: chartFeed.error });
  else if (chartFeed.stale) cards.push({ key: 'freshness', label: 'Data Freshness', value: 'STALE', tone: 'warn', icon: Radio });
  else cards.push({ key: 'freshness', label: 'Data Freshness', value: 'LIVE', tone: 'ok', icon: Radio });

  return (
    <section className="apex-overview-status-cards" aria-label="System status">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.key} className={`apex-overview-status-card tone-${card.tone}`} title={card.title}>
            <span className="apex-overview-status-icon" aria-hidden="true"><Icon size={14} /></span>
            <b>{card.label}</b>
            <em>{card.value}</em>
          </div>
        );
      })}
    </section>
  );
}
