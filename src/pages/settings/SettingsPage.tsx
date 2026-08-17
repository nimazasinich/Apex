import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './SettingsPage.css';
import {
  Bell,
  CheckCircle2,
  KeyRound,
  Laptop,
  Loader2,
  LockKeyhole,
  LogOut,
  Monitor,
  Moon,
  Save,
  Sun,
  Volume2,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  WalletCards,
  Zap,
} from 'lucide-react';
import {
  connectExchange,
  disconnectExchange,
  resetDemoAccount,
  selectAccountMode,
} from '../../services/accountClient';
import { saveSettings } from '../../lib/storage';
import { validateTerminalSettings } from '../../lib/workspaceUi';
import {
  THEME_CHANGE_EVENT,
  readThemePreference,
  setThemePreference,
  type ThemePreference,
} from '../../lib/theme';
import {
  browserNotificationPermission,
  playAlertTone,
  requestBrowserNotificationPermission,
  type BrowserNotificationPermission,
} from '../../lib/notifications';
import {
  DataState,
  KeyValueList,
  Panel,
  PanelHeader,
  StatusBadge,
  WorkspacePageFrame,
} from '../../components/ui/WorkspacePrimitives';
import { TelegramSettingsPanel } from '../../components/TelegramSettingsPanel';
import { IntelligenceSourcesSettingsPanel } from '../../components/IntelligenceSourcesSettingsPanel';
import type { SettingsWorkspaceProps } from '../pageTypes';
import { notifyWorkspace } from '../../lib/workspaceFeedback';

type SettingsSection = 'account' | 'security' | 'appearance' | 'notifications' | 'trading' | 'api' | 'devices';

const sections: Array<{ id: SettingsSection; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'account', label: 'Account', icon: UserRound },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'appearance', label: 'Appearance', icon: Monitor },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'trading', label: 'Trading', icon: SlidersHorizontal },
  { id: 'api', label: 'API Management', icon: KuCoinLogoIcon },
  { id: 'devices', label: 'Devices', icon: Laptop },
];

const sectionDescriptions: Record<SettingsSection, string> = {
  account: 'Environment',
  security: 'Access controls',
  appearance: 'Theme & display',
  notifications: 'Sound & browser',
  trading: 'Risk & leverage',
  api: 'Exchange session',
  devices: 'Active sessions',
};

const integerFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatUsdSetting(value: number, unit = 'USD') {
  return `${integerFormatter.format(value)} ${unit}`;
}

function formatPercentSetting(value: number) {
  return `${percentFormatter.format(value)}%`;
}

function formatLeverageSetting(value: number) {
  return `${integerFormatter.format(value)}x`;
}

function KuCoinLogoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="apex-v3-kucoin-logo-svg" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="KuCoin">
      <circle cx="32" cy="32" r="32" />
      <path d="M17.3 19.7v24.6" />
      <path d="M43.8 19.4 31.2 32l12.6 12.6" />
      <path d="M28.8 32 43.8 17" />
      <path d="M28.8 32 43.8 47" />
      <circle className="apex-v3-kucoin-logo-dot" cx="36.9" cy="32" r="3.9" />
    </svg>
  );
}

function KuCoinHeaderTitle() {
  return (
    <span className="apex-v3-kucoin-title">
      <span className="apex-v3-kucoin-mark" aria-hidden="true">
        <KuCoinLogoIcon size={24} />
      </span>
      <span>KuCoin Futures connection</span>
    </span>
  );
}

export function SettingsPage({ connection, settings, onSettingsChange, onConnectionChange }: SettingsWorkspaceProps) {
  const [section, setSection] = useState<SettingsSection>('account');
  const [form, setForm] = useState({ apiKey: '', apiSecret: '', apiPassphrase: '', keyVersion: '2' as '2' | '3', enableTrading: true });
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [localSettings, setLocalSettings] = useState(settings);
  const [security, setSecurity] = useState<Record<string, unknown> | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [themePreference, setThemeState] = useState<ThemePreference>(() => readThemePreference());
  const [notificationPermission, setNotificationPermission] = useState<BrowserNotificationPermission>(() => browserNotificationPermission());
  const hasLiveConnection = connection.liveAvailable;

  const loadSecurity = useCallback(async () => {
    setSecurityLoading(true);
    try {
      const response = await fetch('/api/security/bootstrap', { credentials: 'same-origin' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `security_status_${response.status}`);
      setSecurity(payload);
      setSecurityError(null);
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : 'security_status_failed');
    } finally {
      setSecurityLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSecurity();
  }, [loadSecurity]);


  const hasPreferenceChanges = useMemo(() => (
    localSettings.minLiquidityUsd !== settings.minLiquidityUsd
    || localSettings.defaultAccountBalanceUsd !== settings.defaultAccountBalanceUsd
    || localSettings.defaultRiskPct !== settings.defaultRiskPct
    || localSettings.defaultLeverage !== settings.defaultLeverage
    || localSettings.autopilotEnabled !== settings.autopilotEnabled
    || localSettings.soundAlertsEnabled !== settings.soundAlertsEnabled
    || localSettings.maxLiveOrderNotionalUsd !== settings.maxLiveOrderNotionalUsd
  ), [localSettings, settings]);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const resetPreferenceDraft = () => {
    setLocalSettings(settings);
    setMessage(null);
    notifyWorkspace({ title: 'Preference draft reset', detail: 'Unsaved trading and notification changes were discarded.', tone: 'info' });
  };

  useEffect(() => {
    if (!message) return;
    const normalized = message.toLowerCase();
    const tone = normalized.includes('failed') || normalized.includes('error') || normalized.includes('invalid')
      ? 'error'
      : normalized.includes('blocked') || normalized.includes('unavailable') || normalized.includes('locked')
        ? 'warning'
        : 'success';
    notifyWorkspace({
      title: tone === 'error' ? 'Settings action failed' : tone === 'warning' ? 'Settings need attention' : 'Settings updated',
      detail: message,
      tone,
      durationMs: tone === 'error' ? 6500 : 4600,
    });
  }, [message]);

  useEffect(() => {
    const syncTheme = () => setThemeState(readThemePreference());
    window.addEventListener(THEME_CHANGE_EVENT, syncTheme);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
  }, []);

  const chooseTheme = (preference: ThemePreference) => {
    setThemePreference(preference);
    setThemeState(preference);
    setMessage(`Theme changed to ${preference === 'system' ? 'System' : preference[0].toUpperCase() + preference.slice(1)}.`);
  };

  const enableBrowserNotifications = async () => {
    const permission = await requestBrowserNotificationPermission();
    setNotificationPermission(permission);
    setMessage(permission === 'granted'
      ? 'Browser notifications enabled for alerts while APEX is in the background.'
      : permission === 'denied'
        ? 'Browser notifications are blocked by the browser. Change the site permission to enable them.'
        : 'Browser notifications are not supported in this environment.');
  };

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setWorking(true); setMessage(null);
    try {
      const result = await connectExchange({ ...form, maxOrderNotionalUsd: localSettings.maxLiveOrderNotionalUsd });
      setForm((current) => ({ ...current, apiKey: '', apiSecret: '', apiPassphrase: '' }));
      onConnectionChange(result.connection, result.snapshot);
      setMessage('KuCoin verified. Portfolio and the selected execution mode are available.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'exchange_connection_failed'); }
    finally { setWorking(false); }
  };

  const disconnect = async () => {
    setWorking(true); setMessage(null);
    try {
      const result = await disconnectExchange();
      onConnectionChange(result.connection, result.snapshot || null);
      setMessage('Live session disconnected and credentials removed from server memory.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'disconnect_failed'); }
    finally { setWorking(false); }
  };

  const switchMode = async (mode: 'demo' | 'live') => {
    if (mode === connection.mode || (mode === 'live' && !hasLiveConnection)) return;
    setWorking(true); setMessage(null);
    try {
      const result = await selectAccountMode(mode, {
        startingBalanceUsd: localSettings.defaultAccountBalanceUsd,
        maxOrderNotionalUsd: mode === 'demo' ? Math.max(localSettings.maxLiveOrderNotionalUsd, 25_000) : undefined,
      });
      onConnectionChange(result.connection, result.snapshot);
      setMessage(mode === 'demo' ? 'Demo mode active: virtual execution with real market data.' : 'Live mode active: verified KuCoin account selected.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'account_mode_switch_failed'); }
    finally { setWorking(false); }
  };

  const resetDemo = async () => {
    setWorking(true); setMessage(null);
    try {
      const result = await resetDemoAccount(localSettings.defaultAccountBalanceUsd, Math.max(localSettings.maxLiveOrderNotionalUsd, 25_000));
      onConnectionChange(result.connection, result.snapshot);
      setMessage('Demo wallet, positions, orders and history were reset.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'demo_reset_failed'); }
    finally { setWorking(false); }
  };

  const savePreferences = () => {
    const validation = validateTerminalSettings(localSettings);
    if (!validation.valid) {
      setMessage(validation.errors.join(' '));
      return;
    }
    saveSettings(validation.settings);
    setLocalSettings(validation.settings);
    onSettingsChange(validation.settings);
    setMessage('Preferences saved and connected to scanner, trade-plan and order-ticket defaults. API credentials were not stored.');
  };

  const accountSection = <div className="apex-v3-settings-section apex-v3-account-section settings-section-account settings-overview-section">
    <Panel className="settings-overview-card settings-account-overview-card">
      <div className="settings-overview-row settings-overview-account-row">
        <span className={`settings-overview-icon ${connection.mode}`}><UserRound size={20} /></span>
        <span className="settings-overview-copy"><strong>Account overview</strong><small>{connection.mode === 'demo' ? 'Demo environment · real market data' : hasLiveConnection ? 'Verified live session available' : 'Live API verification required'}</small></span>
        <span className="settings-overview-values three">
          <span><small>Mode</small><strong>{connection.mode.toUpperCase()}</strong></span>
          <span><small>Portfolio</small><strong>{connection.portfolioState}</strong></span>
          <span><small>Execution</small><strong className={connection.executionState === 'unlocked' ? 'positive' : ''}>{connection.executionState}</strong></span>
        </span>
        <button type="button" className="apex-v3-button secondary compact" onClick={() => setSection('api')}>{hasLiveConnection ? 'Manage API' : 'Connect API'}</button>
      </div>
    </Panel>

    <Panel className="settings-overview-card">
      <div className="settings-overview-row">
        <span className="settings-overview-icon security"><ShieldCheck size={20} /></span>
        <span className="settings-overview-copy"><strong>Security & access</strong><small>Server-reported mutation and execution controls</small></span>
        <span className="settings-overview-values two">
          <span><small>CSRF</small><strong>{securityLoading ? 'Checking' : securityError ? 'Unavailable' : security?.csrfHeaderRequired ? 'Required' : 'Not required'}</strong></span>
          <span><small>Live session</small><strong className={hasLiveConnection ? 'positive' : ''}>{hasLiveConnection ? 'Verified' : 'None'}</strong></span>
        </span>
        <button type="button" className="apex-v3-button secondary compact" onClick={() => setSection('security')}>Review</button>
      </div>
    </Panel>

    <Panel className="settings-overview-card">
      <div className="settings-overview-row settings-overview-appearance-row">
        <span className="settings-overview-icon appearance"><Monitor size={20} /></span>
        <span className="settings-overview-copy"><strong>Appearance</strong><small>Choose how APEX looks and feels</small></span>
        <div className="settings-overview-theme-toggle" role="radiogroup" aria-label="Theme preference">
          <button type="button" role="radio" aria-checked={themePreference === 'light'} className={themePreference === 'light' ? 'active' : ''} onClick={() => chooseTheme('light')}><Sun size={14} /> Light</button>
          <button type="button" role="radio" aria-checked={themePreference === 'dark'} className={themePreference === 'dark' ? 'active' : ''} onClick={() => chooseTheme('dark')}><Moon size={14} /> Dark</button>
          <button type="button" role="radio" aria-checked={themePreference === 'system'} className={themePreference === 'system' ? 'active' : ''} onClick={() => chooseTheme('system')}><Monitor size={14} /> System</button>
        </div>
      </div>
    </Panel>

    <Panel className="settings-overview-card">
      <div className="settings-overview-row settings-overview-notification-row">
        <span className="settings-overview-icon notifications"><Bell size={20} /></span>
        <span className="settings-overview-copy"><strong>Notifications</strong><small>Browser and scanner alert delivery</small></span>
        <span className="settings-overview-values two">
          <span><small>Browser</small><strong>{notificationPermission}</strong></span>
          <span><small>Sound</small><strong>{localSettings.soundAlertsEnabled ? 'Enabled' : 'Off'}</strong></span>
        </span>
        <button type="button" className="apex-v3-button secondary compact" onClick={() => setSection('notifications')}>Manage</button>
      </div>
    </Panel>

    <Panel className="settings-overview-card">
      <div className="settings-overview-row">
        <span className="settings-overview-icon trading"><SlidersHorizontal size={20} /></span>
        <span className="settings-overview-copy"><strong>Trading preferences</strong><small>Default risk, leverage and safe order limits</small></span>
        <span className="settings-overview-values three">
          <span><small>Risk</small><strong>{formatPercentSetting(localSettings.defaultRiskPct)}</strong></span>
          <span><small>Leverage</small><strong>{formatLeverageSetting(localSettings.defaultLeverage)}</strong></span>
          <span><small>Order ceiling</small><strong>{formatUsdSetting(localSettings.maxLiveOrderNotionalUsd, 'USDT')}</strong></span>
        </span>
        <button type="button" className="apex-v3-button secondary compact" onClick={() => setSection('trading')}>Edit</button>
      </div>
    </Panel>

    <Panel className="settings-overview-card">
      <div className="settings-overview-row">
        <span className="settings-overview-icon api"><KuCoinLogoIcon size={20} /></span>
        <span className="settings-overview-copy"><strong>API management</strong><small>Short-lived server session; credentials are not stored in browser storage</small></span>
        <span className="settings-overview-values one"><span><small>KuCoin Futures</small><strong className={hasLiveConnection ? 'positive' : ''}>{hasLiveConnection ? 'Verified session' : 'Not connected'}</strong></span></span>
        <button type="button" className="apex-v3-button secondary compact" onClick={() => setSection('api')}>Manage</button>
      </div>
    </Panel>

    <Panel className="settings-overview-card">
      <div className="settings-overview-row">
        <span className="settings-overview-icon devices"><Laptop size={20} /></span>
        <span className="settings-overview-copy"><strong>Connected devices</strong><small>Current browser and server session</small></span>
        <span className="settings-overview-values two">
          <span><small>Browser</small><strong>Current device</strong></span>
          <span><small>Live session</small><strong>{hasLiveConnection ? '1 verified' : 'None'}</strong></span>
        </span>
        <button type="button" className="apex-v3-button secondary compact" onClick={() => setSection('devices')}>Manage</button>
      </div>
    </Panel>
  </div>;

  const apiSection = <div className="apex-v3-settings-section settings-section-api">
    <PanelHeader title={<KuCoinHeaderTitle />} subtitle="One-time secure server verification" action={hasLiveConnection ? <StatusBadge tone="positive">Verified</StatusBadge> : <StatusBadge>Not connected</StatusBadge>} />
    {hasLiveConnection ? <div className="apex-v3-connected-account"><div><ShieldCheck size={24} /><span><strong>{connection.mode === 'live' ? 'Authenticated session in use' : 'Verified session on standby'}</strong><small>{connection.status === 'connected' ? connection.apiKeyHint : connection.liveApiKeyHint}</small></span></div><KeyValueList rows={[
      { label: 'Portfolio', value: 'Available in Live', tone: 'positive' },
      { label: 'Execution', value: (connection.status === 'connected' ? connection.executionState : connection.liveExecutionState) || '—' },
      { label: 'Order ceiling', value: connection.status === 'connected' ? `${connection.maxOrderNotionalUsd.toLocaleString()} USDT` : connection.liveMaxOrderNotionalUsd != null ? `${connection.liveMaxOrderNotionalUsd.toLocaleString()} USDT` : '—' },
      { label: 'Expires', value: connection.status === 'connected' ? new Date(connection.expiresAt).toLocaleString() : connection.liveExpiresAt ? new Date(connection.liveExpiresAt).toLocaleString() : '—' },
    ]} /><div className="apex-v3-button-row">{connection.mode === 'demo' && <button className="apex-v3-button primary" type="button" onClick={() => void switchMode('live')} disabled={working}><Zap size={15} /> Switch to Live</button>}<button className="apex-v3-button danger" type="button" onClick={() => void disconnect()} disabled={working}><LogOut size={15} /> Disconnect</button></div></div> : <form className="apex-v3-form-grid apex-v3-kucoin-form" onSubmit={(event) => void connect(event)} autoComplete="off">
      <div className="apex-v3-security-banner"><ShieldCheck size={18} /><span><strong>Secure handoff</strong><small>Secrets are submitted once, kept only in short-lived server memory, and represented by an HttpOnly cookie.</small></span></div>
      <label><span>API Key</span><input name="kucoin_api_key" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} required minLength={8} autoComplete="off" spellCheck={false} /></label>
      <label><span>API Secret</span><input type="password" name="kucoin_api_secret" value={form.apiSecret} onChange={(event) => setForm({ ...form, apiSecret: event.target.value })} required minLength={8} autoComplete="off" spellCheck={false} data-lpignore="true" /></label>
      <label><span>API Passphrase</span><input type="password" name="kucoin_api_passphrase" value={form.apiPassphrase} onChange={(event) => setForm({ ...form, apiPassphrase: event.target.value })} required minLength={6} autoComplete="off" spellCheck={false} data-lpignore="true" /></label>
      <div className="two"><label><span>Key version</span><select value={form.keyVersion} onChange={(event) => setForm({ ...form, keyVersion: event.target.value as '2' | '3' })}><option value="2">Version 2</option><option value="3">Version 3</option></select></label><label className="apex-v3-default-field"><span><span>Max order notional</span><em>{formatUsdSetting(localSettings.maxLiveOrderNotionalUsd, 'USDT')}</em></span><input type="number" min="1" step="100" value={localSettings.maxLiveOrderNotionalUsd} onChange={(event) => setLocalSettings({ ...localSettings, maxLiveOrderNotionalUsd: Number(event.target.value) || 2500 })} /></label></div>
      <label className="apex-v3-check apex-v3-kucoin-unlock"><input type="checkbox" checked={form.enableTrading} onChange={(event) => setForm({ ...form, enableTrading: event.target.checked })} /><span>Unlock live order actions after successful verification</span></label>
      <button className="apex-v3-button primary full apex-v3-kucoin-connect-button" type="submit" disabled={working}>{working ? <Loader2 className="spin" size={16} /> : <KeyRound size={16} />} Verify and connect</button>
    </form>}
    <IntelligenceSourcesSettingsPanel onMessage={setMessage} />
  </div>;

  const tradingSection = <div className="apex-v3-settings-section settings-section-trading"><PanelHeader title="Trading preferences" subtitle="Safe local preferences; no credentials" action={<StatusBadge tone={hasPreferenceChanges ? 'warning' : 'positive'}>{hasPreferenceChanges ? 'Unsaved changes' : 'Saved'}</StatusBadge>} /><div className="apex-v3-form-grid apex-v3-preference-form"><div className="two"><label className="apex-v3-default-field"><span><span>Minimum liquidity</span><em>{formatUsdSetting(localSettings.minLiquidityUsd)}</em></span><input type="number" step="1000000" value={localSettings.minLiquidityUsd} onChange={(event) => setLocalSettings({ ...localSettings, minLiquidityUsd: Number(event.target.value) || 10_000_000 })} /></label><label className="apex-v3-default-field"><span><span>Demo starting balance</span><em>{formatUsdSetting(localSettings.defaultAccountBalanceUsd, 'USDT')}</em></span><input type="number" step="500" value={localSettings.defaultAccountBalanceUsd} onChange={(event) => setLocalSettings({ ...localSettings, defaultAccountBalanceUsd: Number(event.target.value) || 100_000 })} /></label></div><div className="two"><label className="apex-v3-default-field"><span><span>Default risk</span><em>{formatPercentSetting(localSettings.defaultRiskPct)}</em></span><input type="number" min="0.1" max="10" step="0.1" value={localSettings.defaultRiskPct} onChange={(event) => setLocalSettings({ ...localSettings, defaultRiskPct: Number(event.target.value) || 1 })} /></label><label className="apex-v3-default-field"><span><span>Default leverage</span><em>{formatLeverageSetting(localSettings.defaultLeverage)}</em></span><input type="number" min="1" max="100" value={localSettings.defaultLeverage} onChange={(event) => setLocalSettings({ ...localSettings, defaultLeverage: Number(event.target.value) || 5 })} /></label></div><label className="apex-v3-check apex-v3-settings-switch"><input type="checkbox" checked={localSettings.autopilotEnabled} onChange={(event) => setLocalSettings({ ...localSettings, autopilotEnabled: event.target.checked })} /><span>Smart Autopilot — rotate strategy/timeframe contexts every 5 minutes, auto-tune thresholds, and auto-promote only multi-agent + holdout/stress eligible candidates (research/paper only)</span></label><div className="apex-v3-button-row apex-v3-settings-actions"><button className="apex-v3-button primary" type="button" onClick={savePreferences} disabled={!hasPreferenceChanges}><Save size={15} /> Save preferences</button>{hasPreferenceChanges && <button className="apex-v3-button secondary" type="button" onClick={resetPreferenceDraft}>Reset changes</button>}{connection.mode === 'demo' && <button className="apex-v3-button danger" type="button" onClick={() => void resetDemo()} disabled={working}><WalletCards size={15} /> Reset demo wallet & history</button>}</div></div></div>;

  const content: Record<SettingsSection, React.ReactNode> = {
    account: accountSection,
    api: apiSection,
    trading: tradingSection,
    notifications: <div className="apex-v3-settings-section settings-section-notifications">
      <PanelHeader title="Notifications" subtitle="Browser, sound and Telegram delivery channels" action={<StatusBadge tone={notificationPermission === 'granted' ? 'positive' : notificationPermission === 'denied' ? 'warning' : 'neutral'}>{notificationPermission}</StatusBadge>} />
      <Panel className="settings-integration-card browser-notification-card">
        <PanelHeader title="Browser alerts" subtitle="Operating-system delivery for active scanner rules" />
        <div className="apex-v3-form-grid">
          <label className="apex-v3-check"><input type="checkbox" checked={localSettings.soundAlertsEnabled} onChange={(event) => setLocalSettings({ ...localSettings, soundAlertsEnabled: event.target.checked })} /><span>Play sound for active scanner rules</span></label>
          <div className="apex-v3-button-row">
            <button className="apex-v3-button secondary" type="button" onClick={() => { const played = playAlertTone(); setMessage(played ? 'Alert sound test played.' : 'Audio is unavailable or blocked until the browser receives a user gesture.'); }}><Volume2 size={15} /> Test sound</button>
            <button className="apex-v3-button secondary" type="button" onClick={() => void enableBrowserNotifications()} disabled={notificationPermission === 'unsupported'}><Bell size={15} /> {notificationPermission === 'granted' ? 'Notifications enabled' : 'Enable browser notifications'}</button>
            <button className="apex-v3-button primary" type="button" onClick={savePreferences} disabled={!hasPreferenceChanges}><Save size={15} /> Save preference</button>{hasPreferenceChanges && <button className="apex-v3-button secondary" type="button" onClick={resetPreferenceDraft}>Reset</button>}
          </div>
          <p className="apex-v3-form-note">In-app alerts always appear in the Alerts workspace. Browser notifications are delivered only when permission is granted and the APEX tab is in the background.</p>
        </div>
      </Panel>
      <TelegramSettingsPanel onMessage={setMessage} />
    </div>,
    security: <div className="apex-v3-settings-section settings-section-security"><PanelHeader title="Security and access" subtitle="Server-reported security requirements" />{securityError ? <DataState availability="error" title="Security status unavailable" detail={securityError} onRetry={() => void loadSecurity()} /> : securityLoading || !security ? <DataState availability="loading" title="Loading security status" detail="Reading server security bootstrap." /> : <KeyValueList rows={[{ label: 'CSRF header', value: security.csrfHeaderRequired ? 'Required' : 'Not required', tone: security.csrfHeaderRequired ? 'positive' : 'warning' }, { label: 'Operator token', value: security.operatorTokenRequired ? 'Required' : 'Optional' }, { label: 'Configured host', value: String(security.host || '—') }, { label: 'Configured port', value: String(security.port || '—') }]} />}<div className="apex-v3-security-banner"><ShieldCheck size={18} /><span><strong>Execution safety model</strong><small>Demo and Live use preview, confirmation, notional and margin checks. Live remains fail-closed until signed authentication succeeds.</small></span></div></div>,
    appearance: <div className="apex-v3-settings-section settings-section-appearance">
      <PanelHeader title="Appearance" subtitle="Choose the active terminal theme" />
      <div className="apex-v3-theme-grid" role="radiogroup" aria-label="Theme preference">
        <button type="button" role="radio" aria-checked={themePreference === 'light'} className={themePreference === 'light' ? 'active' : ''} onClick={() => chooseTheme('light')}><Sun size={18} /><span><strong>Light</strong><small>Bright terminal surfaces</small></span></button>
        <button type="button" role="radio" aria-checked={themePreference === 'dark'} className={themePreference === 'dark' ? 'active' : ''} onClick={() => chooseTheme('dark')}><Moon size={18} /><span><strong>Dark</strong><small>Low-light workspace</small></span></button>
        <button type="button" role="radio" aria-checked={themePreference === 'system'} className={themePreference === 'system' ? 'active' : ''} onClick={() => chooseTheme('system')}><Monitor size={18} /><span><strong>System</strong><small>Follow operating system</small></span></button>
      </div>
      <Panel className="settings-inner-card"><KeyValueList rows={[{ label: 'Preference', value: themePreference.toUpperCase() }, { label: 'Resolved theme', value: document.documentElement.dataset.apexThemeResolved?.toUpperCase() || '—' }, { label: 'Canonical viewport', value: '1368 × 753' }, { label: 'Typography', value: 'Inter / Segoe UI' }, { label: 'Reduced motion', value: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'Enabled by OS' : 'Standard motion' }]} /></Panel>
    </div>,
    devices: <div className="apex-v3-settings-section settings-section-devices"><PanelHeader title="Connected devices" subtitle="Current browser and server session" /><KeyValueList rows={[{ label: 'Browser session', value: 'Current device' }, { label: 'Account mode', value: connection.mode.toUpperCase() }, { label: 'Live session', value: hasLiveConnection ? 'Verified in server memory' : 'None' }, { label: 'Credential storage', value: 'Not stored in browser' }]} /></div>,
  };

  const main = <div className="apex-v3-settings-main">
    <header className="apex-v3-settings-heading"><h1>Settings</h1><p>Manage your account, preferences, security and connected services.</p></header>
    <div className="apex-v3-settings-workspace">
      <nav className="apex-v3-settings-nav" aria-label="Settings sections">
        {sections.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={section === item.id ? 'active' : ''} data-settings-section={item.id} aria-label={item.label} aria-current={section === item.id ? 'page' : undefined} onClick={() => setSection(item.id)}><span className="apex-v3-settings-nav-icon"><Icon size={18} /></span><span className="apex-v3-settings-nav-copy"><strong>{item.label}</strong><small>{sectionDescriptions[item.id]}</small></span></button>; })}
      </nav>
      <Panel className={`apex-v3-settings-body active-settings-${section}`}>{content[section]}{message && <div className="apex-v3-inline-message">{message}</div>}</Panel>
    </div>
  </div>;

  const context = <div className="apex-v3-context-stack settings-context">
    <Panel className="security-status-card"><PanelHeader title="Security status" subtitle="No synthetic score" action={<ShieldCheck size={16} />} /><div className="apex-v3-security-state"><ShieldCheck size={30} /><strong>{security ? 'Server controls available' : securityError ? 'Status unavailable' : 'Checking controls'}</strong><span>{security ? 'Mutation authentication and session controls are reported by the backend.' : securityError || 'Loading security bootstrap.'}</span></div><KeyValueList rows={[{ label: 'API credentials', value: hasLiveConnection ? 'Verified session' : 'Not connected', tone: hasLiveConnection ? 'positive' : '' }, { label: 'Execution', value: connection.executionState, tone: connection.executionState === 'unlocked' ? 'positive' : 'warning' }, { label: 'Mode', value: connection.mode.toUpperCase() }]} /></Panel>
    <Panel className="account-health-card"><PanelHeader title="Account health" subtitle="Current connection state" /><KeyValueList rows={[{ label: 'Portfolio', value: connection.portfolioState }, { label: 'Live available', value: hasLiveConnection ? 'Yes' : 'No' }, { label: 'Order preview', value: connection.status === 'not_connected' ? 'Locked' : connection.requiresOrderPreview ? 'Required' : '—' }, { label: 'Confirmation', value: connection.status === 'not_connected' ? 'Locked' : connection.requiresExplicitConfirmation ? 'Required' : '—' }]} /></Panel>
    <Panel className="next-steps-card"><PanelHeader title="Recommended next steps" subtitle="Based on current state" />{!hasLiveConnection ? <button type="button" className="apex-v3-next-step" onClick={() => setSection('api')}><KeyRound size={16} /><span><strong>Verify a Live API session</strong><small>Required only for real account access.</small></span></button> : connection.mode === 'demo' ? <button type="button" className="apex-v3-next-step" onClick={() => void switchMode('live')}><Zap size={16} /><span><strong>Switch to Live</strong><small>Use the verified KuCoin session.</small></span></button> : <div className="apex-v3-next-step done"><CheckCircle2 size={16} /><span><strong>Live account ready</strong><small>Use server preview before every order.</small></span></div>}<button type="button" className="apex-v3-next-step" onClick={() => setSection('trading')}><SlidersHorizontal size={16} /><span><strong>Review risk defaults</strong><small>Confirm notional, risk and leverage limits.</small></span></button></Panel>
  </div>;

  return <WorkspacePageFrame className="apex-v3-settings-page" main={main} context={context} />;
}
