import React, { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Clock3, Eye, EyeOff, Loader2, Route, Save, Send, ShieldCheck, TriangleAlert, XCircle } from 'lucide-react';
import {
  fetchTelegramStatusDetailed,
  loadTelegramPrefs,
  saveTelegramConfig,
  saveTelegramPrefs,
  sendTelegramTest,
  type TelegramPrefs,
  type TelegramStatus,
} from '../services/telegram';
import { Panel, PanelHeader, StatusBadge } from './ui/WorkspacePrimitives';

const EVENT_ROWS: Array<{ key: keyof TelegramPrefs; label: string; detail: string }> = [
  { key: 'candidate', label: 'Candidate detected', detail: 'Optional early scanner notice' },
  { key: 'confirmed', label: 'Signal confirmed', detail: 'Lifecycle confirmation after consecutive checks' },
  { key: 'expired', label: 'Expired or invalidated', detail: 'Terminal lifecycle without a TP/SL result' },
  { key: 'tpHit', label: 'Take-profit hit', detail: 'Resolved shadow lifecycle win' },
  { key: 'slHit', label: 'Stop-loss hit', detail: 'Resolved shadow lifecycle loss' },
  { key: 'dataDegraded', label: 'Data degraded', detail: 'Reserved for verified provider degradation events' },
];

export function TelegramSettingsPanel({ onMessage }: { onMessage?: (message: string) => void }) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [prefs, setPrefs] = useState<TelegramPrefs>(() => loadTelegramPrefs());
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<'idle' | 'saved' | 'tested' | 'failed'>('idle');
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const response = await fetchTelegramStatusDetailed();
    setStatus(response.status);
    setEnabled(response.status.enabled);
    setStatusError(response.ok ? null : response.error || 'Telegram status unavailable.');
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const save = async () => {
    setSaving(true); setResult('idle');
    const response = await saveTelegramConfig({
      botToken: botToken.trim() || undefined,
      chatId: chatId.trim() || undefined,
      enabled,
    });
    setSaving(false);
    if (!response.ok) {
      setResult('failed');
      onMessage?.(`Telegram configuration failed: ${response.error || 'request_failed'}`);
      return;
    }
    setBotToken('');
    setChatId('');
    setResult('saved');
    await refresh();
    onMessage?.('Telegram configuration saved server-side. The bot token remains write-only.');
  };

  const test = async () => {
    setTesting(true); setResult('idle');
    const response = await sendTelegramTest();
    setTesting(false);
    setResult(response.ok ? 'tested' : 'failed');
    setStatusError(response.ok ? null : response.error || 'Telegram test failed.');
    onMessage?.(response.ok ? 'Telegram test message sent.' : `Telegram test failed: ${response.error || 'request_failed'}`);
    await refresh();
  };

  const connectionLabel = loading ? 'CHECKING'
    : statusError ? 'DISCONNECTED'
      : !status?.configured ? 'MISCONFIGURED'
        : !status.enabled ? 'OFF'
          : status.lastTest?.ok ? 'CONNECTED'
            : status.lastTest ? 'DEGRADED' : 'UNVERIFIED';
  const connectionTone = connectionLabel === 'CONNECTED' ? 'positive'
    : connectionLabel === 'DEGRADED' || connectionLabel === 'UNVERIFIED' ? 'warning'
      : connectionLabel === 'DISCONNECTED' || connectionLabel === 'MISCONFIGURED' ? 'negative' : 'neutral';

  const updatePref = (key: keyof TelegramPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    if (!saveTelegramPrefs(next)) {
      setResult('failed');
      onMessage?.('Telegram event preference was not saved because browser persistence is unavailable.');
      return;
    }
    setPrefs(next);
    onMessage?.('Telegram event preference saved in this browser.');
  };

  return <Panel className="apex-v3-settings-subpanel apex-v3-telegram-panel">
    <PanelHeader
      title="Telegram notifications"
      subtitle="Server-side bot delivery with local event preferences"
      action={<StatusBadge tone={connectionTone}>{connectionLabel}</StatusBadge>}
    />
    {loading ? <div className="apex-v3-telegram-skeleton" aria-label="Loading Telegram status"><i /><i /></div> : <div className="apex-v3-telegram-health-grid">
      <div><Activity size={15} /><span><strong>{status?.enabled ? 'Delivery enabled' : 'Delivery off'}</strong><small>Server delivery state</small></span></div>
      <div><Clock3 size={15} /><span><strong>{status?.lastTest?.latencyMs == null ? '—' : `${status.lastTest.latencyMs} ms`}</strong><small>Last test latency</small></span></div>
      <div><Route size={15} /><span><strong>{status?.lastTest?.route || '—'}</strong><small>Observed transport route</small></span></div>
      <div><Send size={15} /><span><strong>{status?.lastTest?.checkedAt ? new Date(status.lastTest.checkedAt).toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' }) : 'Never'}</strong><small>Last checked · UTC</small></span></div>
    </div>}
    <div className="apex-v3-provider-security"><ShieldCheck size={16} /><span><strong>Write-only credential handoff</strong><small>The browser never receives the stored bot token. Blank fields keep the current server value.</small></span></div>
    <div className="apex-v3-telegram-grid">
      <label><span>Bot token {status?.tokenConfigured ? '· configured' : ''}</span><div className="apex-v3-secret-input"><input type={showToken ? 'text' : 'password'} value={botToken} onChange={(event) => setBotToken(event.target.value)} placeholder={status?.tokenConfigured ? 'Leave blank to keep current token' : 'Telegram bot token'} autoComplete="new-password" /><button type="button" onClick={() => setShowToken((value) => !value)} aria-label={showToken ? 'Hide token' : 'Show token'}>{showToken ? <EyeOff size={14} /> : <Eye size={14} />}</button></div></label>
      <label><span>Chat ID {status?.chatConfigured ? '· configured' : ''}</span><input value={chatId} onChange={(event) => setChatId(event.target.value)} placeholder={status?.chatConfigured ? 'Leave blank to keep current chat' : 'Telegram chat ID'} /></label>
      <label className="apex-v3-check apex-v3-provider-toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>Enable server delivery after configuration</span></label>
      <div className="apex-v3-button-row">
        <button type="button" className="apex-v3-button primary" onClick={() => void save()} disabled={saving || testing}>{saving ? <Loader2 className="spin" size={15} /> : result === 'saved' ? <CheckCircle2 size={15} /> : <Save size={15} />} Save Telegram</button>
        <button type="button" className="apex-v3-button secondary" onClick={() => void test()} disabled={testing || saving || !status?.configured}>{testing ? <Loader2 className="spin" size={15} /> : result === 'failed' ? <XCircle size={15} /> : <Send size={15} />} Send real test</button>
      </div>
    </div>
    <div className="apex-v3-event-preferences">
      <strong>Lifecycle events</strong>
      {EVENT_ROWS.map((row) => <label key={row.key}><span><b>{row.label}</b><small>{row.detail}</small></span><input type="checkbox" checked={prefs[row.key]} onChange={(event) => updatePref(row.key, event.target.checked)} /></label>)}
    </div>
    <div className="apex-v3-integration-history apex-v3-telegram-history">
      <strong>Recent delivery tests</strong>
      {status?.history?.length ? status.history.slice(0, 6).map((row) => <div key={row.id}><span>{row.state}</span><b>{row.summary}</b><small>{row.latencyMs == null ? '—' : `${row.latencyMs} ms`} · {new Date(row.checkedAt).toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' })} UTC</small></div>) : <p>No Telegram delivery test has run in this server session.</p>}
    </div>
    {statusError ? <p className="apex-v3-integration-error" role="alert"><TriangleAlert size={13} />{statusError}</p> : null}
  </Panel>;
}
