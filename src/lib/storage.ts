/**
 * APEX-NEXT Storage & Journal Engine
 * Local persistence for Decision Journal (REQ-070), Outcome Tracking (REQ-071),
 * Calibration Report (REQ-072), Alert Rules (REQ-074), and Settings (REQ-080, 081).
 */

import {
  AlertRule,
  CalibrationBucket,
  DecisionJournalEntry,
  ReadinessTier,
  TerminalSettings,
} from '../types';

const JOURNAL_KEY = 'apex_next_decision_journal_v1';
const ALERTS_KEY = 'apex_next_alerts_v1';
const SETTINGS_KEY = 'apex_next_settings_v1';

export const DEFAULT_SETTINGS: TerminalSettings = {
  minLiquidityUsd: 10000000, // $10M turnover floor
  defaultAccountBalanceUsd: 100000,
  defaultRiskPct: 1.0,
  defaultLeverage: 5,
  autopilotEnabled: false,
  soundAlertsEnabled: true,
  maxLiveOrderNotionalUsd: 2500,
};

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  {
    id: 'rule_confirmed_any',
    name: 'New CONFIRMED candidate (Any Direction)',
    enabled: true,
    direction: 'BOTH',
    minReadiness: 'CONFIRMED',
    minScore: 75,
    triggeredCount: 0,
  },
  {
    id: 'rule_btc_short',
    name: 'BTC-USDT Short Setup >= 70',
    enabled: true,
    direction: 'SHORT',
    minReadiness: 'WATCHLIST',
    minScore: 70,
    symbolFilter: 'BTC-USDT',
    triggeredCount: 0,
  },
];

export function getSettings(): TerminalSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Credentials existed in v1 settings. Remove them during migration so an
    // old browser cannot keep exchange secrets in persistent LocalStorage.
    delete parsed.apiKey;
    delete parsed.apiSecret;
    delete parsed.apiPassphrase;
    const sanitized = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      autopilotEnabled: parsed.autopilotEnabled === true,
    } as TerminalSettings;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitized));
    return sanitized;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: TerminalSettings): void {
  if (typeof window === 'undefined') return;
  try {
    const sanitized = { ...settings } as TerminalSettings & Record<string, unknown>;
    sanitized.autopilotEnabled = settings.autopilotEnabled === true;
    delete sanitized.apiKey;
    delete sanitized.apiSecret;
    delete sanitized.apiPassphrase;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(sanitized));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

export function getJournalEntries(): DecisionJournalEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveJournalEntry(entry: DecisionJournalEntry): void {
  if (typeof window === 'undefined') return;
  try {
    const all = getJournalEntries();
    all.unshift(entry);
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(all));
  } catch (e) {
    console.error('Failed to save journal entry:', e);
  }
}

export function updateJournalEntryOutcome(
  id: string,
  status: 'OPEN' | 'TARGET_HIT' | 'STOP_HIT' | 'EXPIRED',
  closedPrice?: number,
  realizedR?: number
): void {
  if (typeof window === 'undefined') return;
  try {
    const all = getJournalEntries().map((entry) => {
      if (entry.id === id) {
        return {
          ...entry,
          outcomeStatus: status,
          closedPrice,
          closedAt: Date.now(),
          realizedR,
        };
      }
      return entry;
    });
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(all));
  } catch (e) {
    console.error('Failed to update outcome:', e);
  }
}

export function deleteJournalEntry(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const all = getJournalEntries().filter((e) => e.id !== id);
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(all));
  } catch (e) {
    console.error('Failed to delete entry:', e);
  }
}

/**
 * Computes Calibration Buckets by Readiness Tier (REQ-072)
 * Uses the actual score recorded on each DecisionJournalEntry at decision time.
 */
export function computeCalibrationReport(entries: DecisionJournalEntry[]): CalibrationBucket[] {
  const tiers: ReadinessTier[] = ['CONFIRMED', 'WATCHLIST', 'CAUTION', 'BLOCKED'];

  return tiers.map((tier) => {
    const tierEntries = entries.filter(
      (e) => e.readinessTier === tier && e.action === 'ACCEPTED' && e.outcomeStatus !== 'OPEN'
    );
    const totalTrades = tierEntries.length;
    const winningTrades = tierEntries.filter((e) => e.outcomeStatus === 'TARGET_HIT').length;
    const realizedWinRatePct =
      totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;
    const predictedProbAvg =
      totalTrades > 0
        ? Number((tierEntries.reduce((sum, e) => sum + (e.score || 0), 0) / totalTrades).toFixed(1))
        : 0;

    return {
      tier,
      predictedProbAvg,
      realizedWinRatePct,
      totalTrades,
      winningTrades,
    };
  });
}

export function getAlertRules(): AlertRule[] {
  if (typeof window === 'undefined') return DEFAULT_ALERT_RULES;
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    if (!raw) return DEFAULT_ALERT_RULES;
    return JSON.parse(raw);
  } catch {
    return DEFAULT_ALERT_RULES;
  }
}

export function saveAlertRules(rules: AlertRule[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(rules));
  } catch (e) {
    console.error('Failed to save alerts:', e);
  }
}
