import React, { useMemo, useState } from 'react';
import './AlertsPage.css';
import { Bell, BellRing, CheckCircle2, Clock3, Plus, Radio, RotateCcw, Search, Sparkles, Trash2, X } from 'lucide-react';
import {
  DataState,
  MetricTile,
  PageHeading,
  Panel,
  PanelHeader,
  StatusBadge,
  WorkspacePageFrame,
} from '../../components/ui/WorkspacePrimitives';
import type { AlertRule, ReadinessTier, TradeDirection } from '../../types';
import { notifyWorkspace } from '../../lib/workspaceFeedback';
import type { AlertsWorkspaceProps } from '../pageTypes';

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_ALERT_DRAFT = {
  name: 'New scanner alert',
  direction: 'BOTH' as TradeDirection | 'BOTH',
  minReadiness: 'WATCHLIST' as ReadinessTier,
  minScore: 70,
  symbolFilter: '',
};

export function AlertsPage(props: AlertsWorkspaceProps) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(DEFAULT_ALERT_DRAFT);
  const enabled = props.rules.filter((rule) => rule.enabled).length;
  const triggeredCount = props.rules.reduce((sum, rule) => sum + (rule.triggeredCount || 0), 0) + props.activeAlerts.length;
  const coverage = new Set(props.rules.map((rule) => rule.symbolFilter || 'ALL')).size;
  const latestTrigger = props.activeAlerts[0] || null;
  const visibleRules = useMemo(() => {
    const normalized = query.trim().toUpperCase();
    return props.rules.filter((rule) => !normalized || `${rule.name} ${rule.symbolFilter || ''} ${rule.direction}`.toUpperCase().includes(normalized));
  }, [props.rules, query]);
  const selected = props.rules.find((rule) => rule.id === selectedId) || visibleRules[0] || null;

  const updateRule = (id: string, patch: Partial<AlertRule>) => {
    const current = props.rules.find((rule) => rule.id === id);
    props.onRulesChange(props.rules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
    if (current && patch.enabled !== undefined) notifyWorkspace({ title: patch.enabled ? 'Alert enabled' : 'Alert paused', detail: current.name, tone: patch.enabled ? 'success' : 'info' });
  };
  const removeRule = (id: string) => {
    const current = props.rules.find((rule) => rule.id === id);
    if (!current || !window.confirm(`Delete alert rule “${current.name}”?`)) return;
    props.onRulesChange(props.rules.filter((rule) => rule.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (editingId === id) {
      setEditingId(null);
      setDraft(DEFAULT_ALERT_DRAFT);
    }
    notifyWorkspace({ title: 'Alert rule deleted', detail: current.name, tone: 'success' });
  };
  const saveRule = () => {
    const normalizedName = draft.name.trim();
    const normalizedScore = Math.max(0, Math.min(100, Number(draft.minScore) || 0));
    if (!normalizedName) {
      notifyWorkspace({ title: 'Rule name is required', detail: 'Enter a clear name before saving the alert.', tone: 'warning' });
      return;
    }
    if (editingId) {
      props.onRulesChange(props.rules.map((rule) => rule.id === editingId ? {
        ...rule,
        name: normalizedName,
        direction: draft.direction,
        minReadiness: draft.minReadiness,
        minScore: normalizedScore,
        symbolFilter: draft.symbolFilter.trim().toUpperCase() || undefined,
      } : rule));
      setSelectedId(editingId);
      setEditingId(null);
      notifyWorkspace({ title: 'Alert rule updated', detail: normalizedName, tone: 'success' });
      return;
    }
    const next: AlertRule = {
      id: createId(),
      name: normalizedName,
      enabled: true,
      direction: draft.direction,
      minReadiness: draft.minReadiness,
      minScore: normalizedScore,
      symbolFilter: draft.symbolFilter.trim().toUpperCase() || undefined,
      triggeredCount: 0,
    };
    props.onRulesChange([next, ...props.rules]);
    setSelectedId(next.id);
    notifyWorkspace({ title: 'Alert rule created', detail: normalizedName, tone: 'success' });
  };

  const loadSelectedRule = () => {
    if (!selected) return;
    setEditingId(selected.id);
    setDraft({
      name: selected.name,
      direction: selected.direction,
      minReadiness: selected.minReadiness,
      minScore: selected.minScore,
      symbolFilter: selected.symbolFilter || '',
    });
    notifyWorkspace({ title: 'Rule loaded in builder', detail: 'Edit the fields and save to update the selected rule.', tone: 'info' });
  };

  const resetBuilder = () => {
    setEditingId(null);
    setDraft(DEFAULT_ALERT_DRAFT);
  };

  const main = (
    <div className="apex-v3-alerts-main">
      <PageHeading eyebrow="" title="Alerts" subtitle="Stay notified with browser-persisted scanner rules evaluated against real candidate data." />
      <div className="apex-v3-metrics five alerts-summary">
        <MetricTile label="Enabled rules" value={enabled} detail="Actively evaluating" icon={<BellRing size={15} />} tone="positive" />
        <MetricTile label="Total rules" value={props.rules.length} detail="Saved in this browser" icon={<Bell size={15} />} />
        <MetricTile label="Session triggers" value={triggeredCount} detail="Saved count plus this session" icon={<Radio size={15} />} tone="warning" />
        <MetricTile label="Coverage" value={coverage} detail="All-market or symbol scopes" icon={<Sparkles size={15} />} tone="violet" />
        <MetricTile label="Last trigger" value={latestTrigger?.symbol || '—'} detail={latestTrigger?.tier || 'No session trigger'} icon={<Clock3 size={15} />} tone="info" />
      </div>

      <Panel className="apex-v3-table-panel alerts-table">
        <div className="apex-v3-alert-toolbar">
          <div><strong>Alert rules</strong><small>Toggle, inspect or remove local monitoring rules</small></div>
          <div className="apex-v3-alert-search"><label className="apex-v3-search-field compact"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search alerts" aria-label="Search alert rules" /></label>{query && <button type="button" className="apex-v3-icon-button" aria-label="Clear alert search" onClick={() => setQuery('')}><X size={13} /></button>}</div>
        </div>
        {!visibleRules.length ? <DataState availability="empty" title="No alert rules" detail="Create a scanner rule from the builder in the right panel." /> : (
          <div className="apex-v3-table-scroll">
            <table className="apex-v3-table">
              <thead><tr><th>Rule</th><th>Direction</th><th>Readiness</th><th>Minimum score</th><th>Scope</th><th>Triggered</th><th>Status</th><th /></tr></thead>
              <tbody>{visibleRules.map((rule) => <tr key={rule.id} className={selected?.id === rule.id ? 'selected' : ''} onClick={() => setSelectedId(rule.id)} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(rule.id); } }}><td><strong>{rule.name}</strong><small>{rule.id}</small></td><td><StatusBadge tone={rule.direction === 'LONG' ? 'positive' : rule.direction === 'SHORT' ? 'negative' : 'violet'}>{rule.direction}</StatusBadge></td><td>{rule.minReadiness}</td><td>{rule.minScore}</td><td>{rule.symbolFilter || 'All markets'}</td><td>{rule.triggeredCount || 0}</td><td><button type="button" className={`apex-v3-switch ${rule.enabled ? 'on' : ''}`} role="switch" aria-checked={rule.enabled} aria-label={`${rule.enabled ? 'Pause' : 'Enable'} ${rule.name}`} onClick={(event) => { event.stopPropagation(); updateRule(rule.id, { enabled: !rule.enabled }); }}><span /></button></td><td><button type="button" className="apex-v3-icon-button danger" aria-label={`Delete ${rule.name}`} onClick={(event) => { event.stopPropagation(); removeRule(rule.id); }}><Trash2 size={14} /></button></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );

  const context = (
    <div className="apex-v3-context-stack alerts-context">
      <Panel className="alert-builder-card">
        <PanelHeader title={editingId ? "Edit Alert Rule" : "Smart Alert Builder"} subtitle={editingId ? "Updating the selected browser-persisted rule" : "Local browser persistence"} action={<div className="apex-v3-builder-actions">{selected && <button type="button" className="apex-v3-icon-button" onClick={loadSelectedRule} title="Load selected rule into builder" aria-label="Load selected rule into builder"><Sparkles size={14} /></button>}<button type="button" className="apex-v3-icon-button" onClick={resetBuilder} title="Reset builder" aria-label="Reset alert builder"><RotateCcw size={14} /></button></div>} />
        <div className="apex-v3-form-grid">
          <label><span>Rule name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <div className="two"><label><span>Direction</span><select value={draft.direction} onChange={(event) => setDraft({ ...draft, direction: event.target.value as TradeDirection | 'BOTH' })}><option value="BOTH">Both</option><option value="LONG">Long</option><option value="SHORT">Short</option></select></label><label><span>Min score</span><input type="number" min="0" max="100" value={draft.minScore} onChange={(event) => setDraft({ ...draft, minScore: Number(event.target.value) })} /></label></div>
          <label><span>Minimum readiness</span><select value={draft.minReadiness} onChange={(event) => setDraft({ ...draft, minReadiness: event.target.value as ReadinessTier })}><option value="CONFIRMED">Confirmed</option><option value="WATCHLIST">Watchlist</option><option value="CAUTION">Caution</option><option value="BLOCKED">Blocked</option></select></label>
          <label><span>Symbol filter (optional)</span><input value={draft.symbolFilter} onChange={(event) => setDraft({ ...draft, symbolFilter: event.target.value })} placeholder="BTC-USDT" /></label>
          <button type="button" className="apex-v3-button primary full" onClick={saveRule}>{editingId ? <CheckCircle2 size={15} /> : <Plus size={15} />} {editingId ? 'Save rule changes' : 'Create alert rule'}</button>
        </div>
        <p className="apex-v3-form-note">Rules are local-only by design in this build. They do not imply server delivery while the browser is closed.</p>
      </Panel>

      <Panel className="recent-triggers-card">
        <PanelHeader title="Recent triggers" subtitle="Current browser session" action={<Radio size={16} />} />
        {props.activeAlerts.length ? <div className="apex-v3-compact-list">{props.activeAlerts.slice(0, 5).map((alert, index) => <div key={`${alert.rule.id}-${alert.symbol}-${index}`}><span><strong>{alert.symbol}</strong><small>{alert.rule.name}</small></span><StatusBadge tone={alert.tier === 'CONFIRMED' ? 'positive' : 'warning'}>{alert.tier}</StatusBadge></div>)}</div> : <DataState availability="empty" title="No trigger yet" detail="Enabled rules have not matched the current candidate stream." />}
      </Panel>

      <Panel className="quick-templates-card">
        <PanelHeader title="Quick templates" subtitle="Pre-fill the builder" action={<Sparkles size={16} />} />
        <div className="apex-v3-template-list">
          <button type="button" onClick={() => { setEditingId(null); setDraft({ name: 'High-confidence setup', direction: 'BOTH', minReadiness: 'CONFIRMED', minScore: 80, symbolFilter: '' }); notifyWorkspace({ title: 'Template applied', detail: 'High-confidence setup', tone: 'info' }); }}><CheckCircle2 size={15} /><span><strong>High confidence</strong><small>Confirmed · score 80+</small></span></button>
          <button type="button" onClick={() => { setEditingId(null); setDraft({ name: 'BTC directional setup', direction: 'BOTH', minReadiness: 'WATCHLIST', minScore: 70, symbolFilter: 'BTC-USDT' }); notifyWorkspace({ title: 'Template applied', detail: 'BTC directional setup', tone: 'info' }); }}><Bell size={15} /><span><strong>BTC setup</strong><small>Watchlist · score 70+</small></span></button>
          <button type="button" onClick={() => { setEditingId(null); setDraft({ name: 'Short candidate watch', direction: 'SHORT', minReadiness: 'WATCHLIST', minScore: 72, symbolFilter: '' }); notifyWorkspace({ title: 'Template applied', detail: 'Short candidate watch', tone: 'info' }); }}><Radio size={15} /><span><strong>Short watch</strong><small>All markets · score 72+</small></span></button>
        </div>
        {selected && <div className="apex-v3-inline-message">Selected: {selected.name}</div>}
      </Panel>
    </div>
  );

  return <WorkspacePageFrame className="apex-v3-alerts-page" main={main} context={context} />;
}
