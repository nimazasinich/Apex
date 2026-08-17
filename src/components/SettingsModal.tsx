/**
 * APEX-NEXT Settings Modal (REQ-080, REQ-081, REQ-074)
 * - Exchange credentials are handled by the verified account connection page;
 *   secrets are never persisted in browser settings.
 * - Exposes liquidity floor, default risk %, leverage, and in-app alert rules (REQ-081, REQ-074)
 */

import React, { useEffect, useState } from 'react';
import { AlertRule, TerminalSettings } from '../types';
import {
  DEFAULT_ALERT_RULES,
  getAlertRules,
  getSettings,
  saveAlertRules,
  saveSettings,
} from '../lib/storage';
import { AlertTriangle, Bell, Key, Save, Sliders, X } from 'lucide-react';
import { useDialogA11y } from '../lib/useDialogA11y';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange: (settings: TerminalSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsChange,
}) => {
  const [settings, setSettings] = useState<TerminalSettings>(getSettings());
  const [alerts, setAlerts] = useState<AlertRule[]>(getAlertRules());
  const [savedMsg, setSavedMsg] = useState<boolean>(false);
  const dialogRef = useDialogA11y({ isOpen, onClose });

  // Auto-save whenever fields are modified using a debounced update
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      saveSettings(settings);
      saveAlertRules(alerts);
      onSettingsChange(settings);
      setSavedMsg(true);
      const hideTimer = setTimeout(() => setSavedMsg(false), 2000);
      return () => clearTimeout(hideTimer);
    }, 400);
    return () => clearTimeout(timer);
  }, [settings, alerts, isOpen, onSettingsChange]);

  if (!isOpen) return null;

  const handleSave = () => {
    saveSettings(settings);
    saveAlertRules(alerts);
    onSettingsChange(settings);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  };

  const toggleAlertRule = (id: string) => {
    const next = alerts.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    setAlerts(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="bg-[rgba(13,10,28,0.85)] border border-[var(--border)] rounded-lg backdrop-blur-[20px] w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[rgba(26,18,48,0.65)] border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Sliders className="w-5 h-5 text-[var(--accent)]" aria-hidden />
            <h2 id="settings-modal-title" className="terminal-text-base font-bold text-slate-100 uppercase tracking-wide">
              Terminal Settings & Alert Configuration (REQ-080, REQ-081)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[rgba(36,26,61,0.55)] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
          {/* Secure credential handoff notice */}
          <div className="px-3 py-2.5 rounded bg-[var(--warning)]/10 border border-[var(--warning)]/40 flex items-center gap-3 text-[var(--warning)] terminal-text-xs font-semibold uppercase">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div>
              <div className="font-bold">
                Exchange credentials are managed in the Account Connection page
              </div>
              <div className="text-slate-300 font-normal mt-0.5">
                API Secret and Passphrase are never saved in LocalStorage. A verified, short-lived
                server session is required before Portfolio or live order actions can unlock.
              </div>
            </div>
          </div>

          {/* 1. Exchange connection security */}
          <div className="bg-[rgba(36,26,61,0.55)] border border-[var(--border)] rounded p-4 space-y-3">
            <div className="flex items-center gap-2 terminal-text-sm font-bold text-slate-200 uppercase">
              <Key className="w-4 h-4 text-[var(--accent)]" />
              <span>Exchange API Connection</span>
            </div>
            <div className="terminal-text-xs text-slate-300 leading-relaxed">
              Open the Settings page in the new workspace to verify or disconnect a KuCoin account.
              This preferences dialog intentionally contains no credential fields.
            </div>
          </div>

          {/* 2. Tunable Thresholds & Floors (REQ-081) */}
          <div className="bg-[rgba(36,26,61,0.55)] border border-[var(--border)] rounded p-4 space-y-4">
            <div className="terminal-text-sm font-bold text-slate-200 uppercase">
              Scanner & Sizing Thresholds (REQ-081)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block terminal-text-xs text-slate-400 uppercase mb-1">
                  Min Liquidity Floor (USD)
                </label>
                <input
                  type="number"
                  step="1000000"
                  value={settings.minLiquidityUsd}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      minLiquidityUsd: parseFloat(e.target.value) || 10000000,
                    })
                  }
                  className="w-full bg-[rgba(13,10,28,0.72)] border border-[var(--border)] rounded px-3 py-1.5 text-slate-100 font-terminal-num terminal-text-sm focus:border-[var(--accent)] outline-none"
                />
                <span className="terminal-text-xs text-slate-400 mt-1 block">
                  e.g., 10000000 = $10M 24h floor
                </span>
              </div>
              <div>
                <label className="block terminal-text-xs text-slate-400 uppercase mb-1">
                  Live Order Notional Limit ($)
                </label>
                <input
                  type="number"
                  min="1"
                  step="100"
                  value={settings.maxLiveOrderNotionalUsd}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxLiveOrderNotionalUsd: parseFloat(e.target.value) || 2500,
                    })
                  }
                  className="w-full bg-[rgba(13,10,28,0.72)] border border-[var(--border)] rounded px-3 py-1.5 text-slate-100 font-terminal-num terminal-text-sm focus:border-[var(--accent)] outline-none"
                />
              </div>
              <div>
                <label className="block terminal-text-xs text-slate-400 uppercase mb-1">
                  Default Account Balance ($)
                </label>
                <input
                  type="number"
                  step="500"
                  value={settings.defaultAccountBalanceUsd}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultAccountBalanceUsd: parseFloat(e.target.value) || 10000,
                    })
                  }
                  className="w-full bg-[rgba(13,10,28,0.72)] border border-[var(--border)] rounded px-3 py-1.5 text-slate-100 font-terminal-num terminal-text-sm focus:border-[var(--accent)] outline-none"
                />
              </div>
              <div>
                <label className="block terminal-text-xs text-slate-400 uppercase mb-1">
                  Default Leverage (x)
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={settings.defaultLeverage}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultLeverage: parseInt(e.target.value, 10) || 5,
                    })
                  }
                  className="w-full bg-[rgba(13,10,28,0.72)] border border-[var(--border)] rounded px-3 py-1.5 text-slate-100 font-terminal-num terminal-text-sm focus:border-[var(--accent)] outline-none"
                />
              </div>
            </div>
          </div>

          {/* 3. In-App Alert Conditions (REQ-074) */}
          <div className="bg-[rgba(36,26,61,0.55)] border border-[var(--border)] rounded p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 terminal-text-sm font-bold text-slate-200 uppercase">
                <Bell className="w-4 h-4 text-[var(--accent)]" />
                <span>In-App Alert Rules (REQ-074)</span>
              </div>
              <span className="terminal-text-xs text-slate-400">
                Triggered notifications banner on dashboard
              </span>
            </div>

            <div className="space-y-2">
              {alerts.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between bg-[rgba(13,10,28,0.72)] px-3 py-2.5 rounded border border-[var(--border)]"
                >
                  <div className="flex flex-col">
                    <span className="terminal-text-sm font-semibold text-slate-100">
                      {rule.name}
                    </span>
                    <span className="terminal-text-xs text-slate-400">
                      Min Tier: <strong className="text-slate-200">{rule.minReadiness}</strong> |
                      Min Score: <strong className="text-slate-200">{rule.minScore}</strong> |
                      Direction: <strong className="text-[var(--accent)]">{rule.direction}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="terminal-text-xs text-slate-400 font-terminal-num">
                      Triggered: {rule.triggeredCount}x
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleAlertRule(rule.id)}
                      className={`px-3 py-1 rounded font-terminal-num terminal-text-xs font-bold uppercase transition-colors cursor-pointer ${
                        rule.enabled
                          ? 'bg-[var(--bullish)]/20 text-[var(--bullish)] border border-[var(--bullish)]/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {rule.enabled ? 'ACTIVE' : 'MUTED'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-[rgba(26,18,48,0.65)] border-t border-[var(--border)] flex items-center justify-between shrink-0">
          <div>
            {savedMsg && (
              <span className="text-[var(--bullish)] terminal-text-xs font-semibold animate-fade-in">
                Settings & Alert Rules Auto-Saved!
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-black font-terminal-num font-bold rounded transition-colors cursor-pointer flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>SAVE SETTINGS & ALERTS</span>
          </button>
        </div>
      </div>
    </div>
  );
};
